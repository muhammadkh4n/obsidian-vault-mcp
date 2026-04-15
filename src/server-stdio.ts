/**
 * stdio transport — default for local Claude Code.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { VaultBackend } from './types.js';
import { registerTools } from './tools.js';

export async function startStdioServer(vault: VaultBackend): Promise<void> {
  const mcp = new McpServer(
    { name: '@freewilling/obsidian-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  registerTools(mcp, vault);

  const transport = new StdioServerTransport();
  await mcp.connect(transport);

  process.on('SIGINT', async () => {
    await mcp.close();
    process.exit(0);
  });
}
