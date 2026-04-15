/**
 * Local filesystem vault backend.
 * Reads/writes .md files directly from the Obsidian vault folder.
 * Works with any sync method: official Sync, iCloud, Dropbox, or none.
 */

import { readFile, writeFile, readdir, unlink, mkdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { VaultBackend, NoteEntry, SearchResult } from '../types.js';

export class LocalVault implements VaultBackend {
  constructor(private readonly vaultPath: string) {}

  static async connect(vaultPath: string): Promise<LocalVault> {
    const s = await stat(vaultPath).catch(() => null);
    if (!s?.isDirectory()) {
      throw new Error(`Vault path is not a directory: ${vaultPath}`);
    }
    return new LocalVault(vaultPath);
  }

  async readNote(path: string): Promise<string | null> {
    try {
      return await readFile(join(this.vaultPath, path), 'utf-8');
    } catch {
      return null;
    }
  }

  async listNotes(folder?: string): Promise<NoteEntry[]> {
    const entries: NoteEntry[] = [];
    const base = folder ? join(this.vaultPath, folder) : this.vaultPath;

    try {
      const files = await readdir(base, { recursive: true, withFileTypes: true });
      for (const entry of files) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.md')) continue;

        const fullPath = join(entry.parentPath ?? entry.path, entry.name);
        const rel = relative(this.vaultPath, fullPath);

        if (rel.startsWith('.obsidian')) continue;
        if (rel.startsWith('.trash')) continue;

        try {
          const s = await stat(fullPath);
          entries.push({ path: rel, mtime: s.mtimeMs, size: s.size });
        } catch {
          // File may have been deleted between readdir and stat
        }
      }
    } catch {
      // Directory may not exist
    }

    return entries;
  }

  async writeNote(path: string, content: string): Promise<void> {
    const fullPath = join(this.vaultPath, path);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }

  async appendNote(path: string, content: string): Promise<void> {
    const existing = await this.readNote(path);
    const merged = existing ? existing.trimEnd() + '\n\n' + content : content;
    await this.writeNote(path, merged);
  }

  async deleteNote(path: string): Promise<void> {
    try {
      await unlink(join(this.vaultPath, path));
    } catch {
      // Already gone
    }
  }

  async searchNotes(query: string, folder?: string): Promise<SearchResult[]> {
    const notes = await this.listNotes(folder);
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    for (const note of notes) {
      const content = await this.readNote(note.path);
      if (!content) continue;
      const idx = content.toLowerCase().indexOf(lowerQuery);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 100);
      const end = Math.min(content.length, idx + query.length + 100);
      results.push({ path: note.path, snippet: content.slice(start, end) });
    }

    return results;
  }
}
