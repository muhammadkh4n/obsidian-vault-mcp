/**
 * MCP tool registrations — 7 tools for Obsidian vault operations.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { VaultBackend } from './types.js';
import { parseActionItems } from './action-items.js';

export function registerTools(mcp: McpServer, vault: VaultBackend): void {
  mcp.registerTool('list_notes', {
    title: 'List Notes',
    description: 'List all notes in the Obsidian vault, optionally filtered by folder prefix',
    inputSchema: { folder: z.string().optional().describe('Folder prefix filter, e.g. "Daily/" or "Projects/"') },
    annotations: { readOnlyHint: true },
  }, async ({ folder }) => {
    const notes = await vault.listNotes(folder);
    return { content: [{ type: 'text' as const, text: JSON.stringify(notes, null, 2) }] };
  });

  mcp.registerTool('read_note', {
    title: 'Read Note',
    description: 'Read the full content of an Obsidian note by its vault path',
    inputSchema: { path: z.string().describe('Vault path, e.g. "Projects/Ouija.md"') },
    annotations: { readOnlyHint: true },
  }, async ({ path }) => {
    const content = await vault.readNote(path);
    if (content === null) {
      return { content: [{ type: 'text' as const, text: `Note not found: ${path}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: content }] };
  });

  mcp.registerTool('write_note', {
    title: 'Write Note',
    description: 'Create or overwrite an Obsidian note. Syncs to all devices.',
    inputSchema: {
      path: z.string().describe('Vault path, e.g. "Projects/NewNote.md"'),
      content: z.string().describe('Markdown content for the note'),
    },
    annotations: { destructiveHint: true },
  }, async ({ path, content }) => {
    await vault.writeNote(path, content);
    return { content: [{ type: 'text' as const, text: `Written: ${path}` }] };
  });

  mcp.registerTool('append_note', {
    title: 'Append to Note',
    description: 'Append content to an existing Obsidian note (creates if it does not exist)',
    inputSchema: {
      path: z.string().describe('Vault path'),
      content: z.string().describe('Markdown content to append'),
    },
    annotations: { destructiveHint: true },
  }, async ({ path, content }) => {
    await vault.appendNote(path, content);
    return { content: [{ type: 'text' as const, text: `Appended to: ${path}` }] };
  });

  mcp.registerTool('delete_note', {
    title: 'Delete Note',
    description: 'Delete an Obsidian note from the vault',
    inputSchema: { path: z.string().describe('Vault path to delete') },
    annotations: { destructiveHint: true },
  }, async ({ path }) => {
    await vault.deleteNote(path);
    return { content: [{ type: 'text' as const, text: `Deleted: ${path}` }] };
  });

  mcp.registerTool('search_notes', {
    title: 'Search Notes',
    description: 'Full-text search across all Obsidian notes',
    inputSchema: {
      query: z.string().describe('Search query (case-insensitive substring match)'),
      folder: z.string().optional().describe('Limit search to a folder prefix'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ query, folder }) => {
    const results = await vault.searchNotes(query, folder);
    if (results.length === 0) {
      return { content: [{ type: 'text' as const, text: `No notes found matching: "${query}"` }] };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
  });

  mcp.registerTool('get_action_items', {
    title: 'Get Action Items',
    description: 'Extract TODO items, checkboxes, and action items from an Obsidian note',
    inputSchema: { path: z.string().describe('Vault path to extract action items from') },
    annotations: { readOnlyHint: true },
  }, async ({ path }) => {
    const content = await vault.readNote(path);
    if (content === null) {
      return { content: [{ type: 'text' as const, text: `Note not found: ${path}` }], isError: true };
    }
    const items = parseActionItems(content);
    if (items.length === 0) {
      return { content: [{ type: 'text' as const, text: `No action items found in: ${path}` }] };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(items, null, 2) }] };
  });
}
