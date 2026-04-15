# obsidian-vault-mcp

MCP server that gives Claude Code (and any MCP client) read/write access to your Obsidian vault. Supports local vault folders and remote CouchDB/LiveSync with end-to-end encryption.

## Quick Start (Local Vault)

Works with any sync method — official Obsidian Sync, iCloud, Dropbox, or none.

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "obsidian-vault-mcp", "--vault", "~/Documents/MyVault"]
    }
  }
}
```

That's it. Claude Code can now read, write, search, and extract action items from your vault.

## Quick Start (CouchDB/LiveSync)

For remote access to an E2E-encrypted vault via [Obsidian LiveSync](https://github.com/vrtmrz/obsidian-livesync):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "obsidian-vault-mcp"],
      "env": {
        "OBSIDIAN_MCP_COUCHDB_URL": "http://admin:password@localhost:5984",
        "OBSIDIAN_MCP_PASSPHRASE": "your-livesync-e2ee-passphrase"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `list_notes` | List all notes, optionally filtered by folder |
| `read_note` | Read a note's full content |
| `write_note` | Create or overwrite a note |
| `append_note` | Append content to a note |
| `delete_note` | Delete a note |
| `search_notes` | Full-text search across all notes |
| `get_action_items` | Extract TODOs, checkboxes, and action items |

## HTTP Mode

For remote access (e.g., from a VPS accessible over Tailscale):

```bash
npx obsidian-vault-mcp --vault ~/MyVault --http --port 3848 --token mysecret
```

Then in Claude Code:

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "http",
      "url": "http://your-server:3848/mcp",
      "headers": { "Authorization": "Bearer mysecret" }
    }
  }
}
```

## Configuration

| CLI Flag | Env Var | Description |
|----------|---------|-------------|
| `--vault <path>` | `OBSIDIAN_MCP_VAULT` | Path to local vault folder |
| `--couchdb <url>` | `OBSIDIAN_MCP_COUCHDB_URL` | CouchDB URL (with auth) |
| `--database <name>` | `OBSIDIAN_MCP_DATABASE` | CouchDB database (default: `obsidian-vault`) |
| `--passphrase <str>` | `OBSIDIAN_MCP_PASSPHRASE` | LiveSync E2EE passphrase |
| `--http` | — | Use HTTP transport (default: stdio) |
| `--port <n>` | `OBSIDIAN_MCP_PORT` | HTTP port (default: 3848) |
| `--token <str>` | `OBSIDIAN_MCP_TOKEN` | Bearer token for HTTP auth |

Provide either `--vault` or `--couchdb`, not both.

## How It Works

**Local mode**: Reads and writes `.md` files directly from your vault folder. No encryption, no network calls. Works with any sync solution.

**CouchDB mode**: Connects to CouchDB where Obsidian LiveSync stores encrypted note chunks. Decrypts on-the-fly using PBKDF2 (310k iterations) + HKDF + AES-256-GCM — the same scheme LiveSync uses. No vault files on disk.

## Security

- **Local mode**: Files are read/written with the permissions of the running process. No network exposure in stdio mode.
- **CouchDB mode**: All note content is encrypted at rest in CouchDB. The passphrase never leaves the process. PBKDF2 salt is auto-fetched from CouchDB at startup.
- **HTTP mode**: Use `--token` for bearer auth. For remote access, use a VPN (Tailscale recommended) rather than exposing the port to the internet.
- **Credentials**: Use environment variables for secrets, not CLI flags (CLI args are visible in `ps`).

## Requirements

- Node.js 18+
- An Obsidian vault (local folder or CouchDB with LiveSync)

## License

MIT
