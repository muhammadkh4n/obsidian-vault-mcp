/**
 * Streamable HTTP transport — for remote access over network.
 * Uses Node.js native http module (no Fastify dependency).
 */

import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { VaultBackend } from './types.js';
import { registerTools } from './tools.js';

interface Session {
  transport: StreamableHTTPServerTransport;
  mcp: McpServer;
}

function createMcpServer(vault: VaultBackend): McpServer {
  const mcp = new McpServer(
    { name: 'obsidian-vault-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  registerTools(mcp, vault);
  return mcp;
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

export async function startHttpServer(
  vault: VaultBackend,
  port: number,
  token?: string,
): Promise<void> {
  const sessions = new Map<string, Session>();

  const server = http.createServer(async (req, res) => {
    // Auth check
    if (token && req.url !== '/health') {
      const auth = req.headers['authorization']?.replace('Bearer ', '');
      if (auth !== token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    // Health
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', sessions: sessions.size }));
      return;
    }

    // MCP endpoint
    if (req.url === '/mcp') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (req.method === 'POST') {
        const body = await readBody(req).catch(() => null);
        if (!body) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid body' }));
          return;
        }

        if (sessionId && sessions.has(sessionId)) {
          await sessions.get(sessionId)!.transport.handleRequest(req, res, body);
        } else if (!sessionId) {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
          });
          const mcp = createMcpServer(vault);
          await mcp.connect(transport);

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid) sessions.delete(sid);
          };

          await transport.handleRequest(req, res, body);

          const sid = transport.sessionId;
          if (sid) sessions.set(sid, { transport, mcp });
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
        }
        return;
      }

      if (req.method === 'GET') {
        if (sessionId && sessions.has(sessionId)) {
          await sessions.get(sessionId)!.transport.handleRequest(req, res);
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session ID required' }));
        }
        return;
      }

      if (req.method === 'DELETE') {
        if (sessionId && sessions.has(sessionId)) {
          await sessions.get(sessionId)!.transport.close();
          sessions.delete(sessionId);
          res.writeHead(204);
          res.end();
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
        }
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, '0.0.0.0', () => {
    console.error(`obsidian-vault-mcp HTTP server listening on port ${port}`);
  });

  const shutdown = async () => {
    for (const [, session] of sessions) {
      await session.transport.close().catch(() => {});
    }
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
