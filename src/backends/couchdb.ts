/**
 * CouchDB/LiveSync vault backend with E2E encryption.
 * Reads/writes notes via CouchDB, encrypting/decrypting with LiveSync's
 * PBKDF2 + HKDF + AES-256-GCM scheme.
 */

import * as crypto from 'node:crypto';
import { LiveSyncCrypto } from '../crypto.js';
import { couchGet, couchPut, couchDelete } from '../couch.js';
import type {
  VaultBackend,
  NoteEntry,
  SearchResult,
  CouchDBConfig,
  LiveSyncNote,
  LiveSyncChunk,
} from '../types.js';

export class CouchDBVault implements VaultBackend {
  private readonly cryptor: LiveSyncCrypto;
  private readonly dbUrl: string;

  private constructor(cryptor: LiveSyncCrypto, dbUrl: string) {
    this.cryptor = cryptor;
    this.dbUrl = dbUrl;
  }

  static async connect(config: CouchDBConfig): Promise<CouchDBVault> {
    const db = config.database ?? 'obsidian-vault';
    const dbUrl = `${config.couchdbUrl.replace(/\/$/, '')}/${db}`;

    // Verify CouchDB is reachable
    const info = await couchGet<{ db_name: string; doc_count: number }>(dbUrl);
    console.error(`Connected to CouchDB: ${info.db_name} (${info.doc_count} docs)`);

    // Fetch PBKDF2 salt
    let salt = config.pbkdf2Salt;
    if (!salt) {
      const params = await couchGet<{ pbkdf2salt: string }>(
        `${dbUrl}/_local/obsidian_livesync_sync_parameters`,
      );
      salt = params.pbkdf2salt;
      console.error('Fetched PBKDF2 salt from CouchDB');
    }

    const cryptor = new LiveSyncCrypto(config.passphrase, salt);
    return new CouchDBVault(cryptor, dbUrl);
  }

  async readNote(path: string): Promise<string | null> {
    const docId = this.pathToDocId(path);
    try {
      const resp = await couchGet<LiveSyncNote & { error?: string }>(
        `${this.dbUrl}/${encodeURIComponent(docId)}`,
      );
      if (resp.error || resp.deleted) return null;
      if (!resp.children?.length) return null;
      return await this.reassembleNote(resp);
    } catch {
      return null;
    }
  }

  async listNotes(folder?: string): Promise<NoteEntry[]> {
    const allDocs = await couchGet<{
      rows: Array<{ doc: LiveSyncNote }>;
    }>(`${this.dbUrl}/_all_docs?include_docs=true&limit=10000`);

    const noteTypes = new Set(['plain', 'newnote', 'notes']);
    return allDocs.rows
      .map((r) => r.doc)
      .filter((d) =>
        d.path &&
        noteTypes.has(d.type) &&
        !d.path.startsWith('.obsidian/') &&
        !d.deleted &&
        (!folder || d.path.startsWith(folder)),
      )
      .map((d) => ({ path: d.path, mtime: d.mtime, size: d.size }));
  }

  async writeNote(path: string, content: string): Promise<void> {
    const docId = this.pathToDocId(path);
    const now = Date.now();

    let existingRev: string | undefined;
    let existingCtime: number | undefined;
    let oldChunkIds: string[] = [];
    try {
      const existing = await couchGet<LiveSyncNote>(`${this.dbUrl}/${encodeURIComponent(docId)}`);
      existingRev = existing._rev;
      existingCtime = existing.ctime;
      oldChunkIds = existing.children ?? [];
    } catch {
      // Note doesn't exist
    }

    const chunkId = this.generateChunkId();
    const encryptedData = this.cryptor.encrypt(content);

    const chunkResult = await couchPut(
      `${this.dbUrl}/${encodeURIComponent(chunkId)}`,
      { _id: chunkId, data: encryptedData, type: 'leaf', e_: true },
    );
    if (chunkResult.error) {
      throw new Error(`Failed to write chunk: ${chunkResult.error} — ${chunkResult.reason}`);
    }

    const noteDoc: Record<string, unknown> = {
      _id: docId,
      path,
      children: [chunkId],
      ctime: existingCtime ?? now,
      mtime: now,
      size: Buffer.byteLength(content, 'utf-8'),
      type: 'plain',
      eden: {},
    };
    if (existingRev) noteDoc['_rev'] = existingRev;

    const noteResult = await couchPut(
      `${this.dbUrl}/${encodeURIComponent(docId)}`,
      noteDoc,
    );
    if (noteResult.error) {
      // Clean up orphaned chunk
      await this.deleteChunk(chunkId).catch(() => {});
      throw new Error(`Failed to write note: ${noteResult.error} — ${noteResult.reason}`);
    }

    for (const oldId of oldChunkIds) {
      if (oldId !== chunkId) this.deleteChunk(oldId).catch(() => {});
    }
  }

  async appendNote(path: string, content: string): Promise<void> {
    const existing = await this.readNote(path);
    const merged = existing ? existing.trimEnd() + '\n\n' + content : content;
    await this.writeNote(path, merged);
  }

  async deleteNote(path: string): Promise<void> {
    const docId = this.pathToDocId(path);
    try {
      const doc = await couchGet<LiveSyncNote>(`${this.dbUrl}/${encodeURIComponent(docId)}`);
      for (const chunkId of doc.children ?? []) {
        await this.deleteChunk(chunkId).catch(() => {});
      }
      await couchDelete(`${this.dbUrl}/${encodeURIComponent(docId)}?rev=${doc._rev}`);
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async reassembleNote(doc: LiveSyncNote): Promise<string> {
    const chunks: string[] = [];
    if (doc.eden && Object.keys(doc.eden).length > 0) {
      for (const chunkId of doc.children ?? []) {
        const edenChunk = doc.eden[chunkId];
        if (edenChunk?.data) {
          chunks.push(this.cryptor.decrypt(edenChunk.data));
          continue;
        }
        const chunk = await this.fetchChunk(chunkId);
        if (chunk) chunks.push(this.cryptor.decrypt(chunk.data));
      }
    } else {
      for (const chunkId of doc.children ?? []) {
        const chunk = await this.fetchChunk(chunkId);
        if (chunk) chunks.push(this.cryptor.decrypt(chunk.data));
      }
    }
    return chunks.join('');
  }

  private async fetchChunk(chunkId: string): Promise<LiveSyncChunk | null> {
    try {
      return await couchGet<LiveSyncChunk>(`${this.dbUrl}/${encodeURIComponent(chunkId)}`);
    } catch {
      return null;
    }
  }

  private pathToDocId(path: string): string {
    return path.toLowerCase();
  }

  private generateChunkId(): string {
    const random = crypto.randomBytes(12).toString('hex');
    const id = BigInt('0x' + random).toString(36);
    return `h:+${id}`;
  }

  private async deleteChunk(chunkId: string): Promise<void> {
    try {
      const chunk = await couchGet<{ _rev: string }>(`${this.dbUrl}/${encodeURIComponent(chunkId)}`);
      await couchDelete(`${this.dbUrl}/${encodeURIComponent(chunkId)}?rev=${chunk._rev}`);
    } catch {
      // Already gone
    }
  }
}
