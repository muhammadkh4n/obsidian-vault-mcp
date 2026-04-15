#!/usr/bin/env node

/**
 * obsidian-vault-mcp CLI
 *
 * Usage:
 *   npx obsidian-vault-mcp --vault ~/Documents/MyVault
 *   npx obsidian-vault-mcp --couchdb http://admin:pass@localhost:5984 --passphrase "..."
 *   npx obsidian-vault-mcp --vault ~/MyVault --http --port 3848 --token secret
 */

import { LocalVault } from './backends/filesystem.js';
import { CouchDBVault } from './backends/couchdb.js';
import { startStdioServer } from './server-stdio.js';
import { startHttpServer } from './server-http.js';
import type { VaultBackend } from './types.js';

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function env(key: string): string | undefined {
  return process.env[key];
}

const HELP = `
obsidian-vault-mcp — Give Claude Code read/write access to your Obsidian vault

USAGE:
  npx obsidian-vault-mcp --vault <path>                    Local vault (stdio)
  npx obsidian-vault-mcp --couchdb <url> --passphrase ...  CouchDB/LiveSync (stdio)
  npx obsidian-vault-mcp --vault <path> --http             HTTP transport

OPTIONS:
  --vault <path>        Path to local Obsidian vault folder
  --couchdb <url>       CouchDB URL (with auth), e.g. http://admin:pass@localhost:5984
  --database <name>     CouchDB database name (default: obsidian-vault)
  --passphrase <str>    LiveSync E2E encryption passphrase (required for CouchDB)
  --http                Use Streamable HTTP transport (default: stdio)
  --port <number>       HTTP port (default: 3848)
  --token <string>      Bearer token for HTTP auth
  --help                Show this help
  --version             Show version

ENVIRONMENT VARIABLES:
  OBSIDIAN_MCP_VAULT          Same as --vault
  OBSIDIAN_MCP_COUCHDB_URL    Same as --couchdb
  OBSIDIAN_MCP_DATABASE       Same as --database
  OBSIDIAN_MCP_PASSPHRASE     Same as --passphrase
  OBSIDIAN_MCP_PORT           Same as --port
  OBSIDIAN_MCP_TOKEN          Same as --token
`.trim();

async function main() {
  const args = process.argv.slice(2);

  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    process.exit(0);
  }

  if (hasFlag(args, '--version') || hasFlag(args, '-v')) {
    console.log('0.1.0');
    process.exit(0);
  }

  const vaultPath = getArg(args, '--vault') ?? env('OBSIDIAN_MCP_VAULT');
  const couchdbUrl = getArg(args, '--couchdb') ?? env('OBSIDIAN_MCP_COUCHDB_URL');
  const database = getArg(args, '--database') ?? env('OBSIDIAN_MCP_DATABASE');
  const passphrase = getArg(args, '--passphrase') ?? env('OBSIDIAN_MCP_PASSPHRASE');
  const useHttp = hasFlag(args, '--http');
  const port = parseInt(getArg(args, '--port') ?? env('OBSIDIAN_MCP_PORT') ?? '3848', 10);
  const token = getArg(args, '--token') ?? env('OBSIDIAN_MCP_TOKEN');

  if (!vaultPath && !couchdbUrl) {
    console.error('Error: Provide either --vault <path> or --couchdb <url>\n');
    console.error(HELP);
    process.exit(1);
  }

  if (vaultPath && couchdbUrl) {
    console.error('Error: Provide --vault or --couchdb, not both\n');
    process.exit(1);
  }

  if (couchdbUrl && !passphrase) {
    console.error('Error: --passphrase is required when using --couchdb\n');
    process.exit(1);
  }

  let vault: VaultBackend;

  if (vaultPath) {
    const resolvedPath = vaultPath.replace(/^~/, process.env['HOME'] ?? '');
    vault = await LocalVault.connect(resolvedPath);
    console.error(`Connected to local vault: ${resolvedPath}`);
  } else {
    vault = await CouchDBVault.connect({
      type: 'couchdb',
      couchdbUrl: couchdbUrl!,
      database,
      passphrase: passphrase!,
    });
  }

  if (useHttp) {
    await startHttpServer(vault, port, token);
  } else {
    await startStdioServer(vault);
  }
}

main().catch((err) => {
  console.error(`Fatal: ${(err as Error).message}`);
  process.exit(1);
});
