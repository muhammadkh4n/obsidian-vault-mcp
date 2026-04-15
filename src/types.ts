/**
 * Shared types for obsidian-vault-mcp
 */

/** Backend-agnostic vault interface. Both filesystem and CouchDB implement this. */
export interface VaultBackend {
  readNote(path: string): Promise<string | null>;
  listNotes(folder?: string): Promise<NoteEntry[]>;
  writeNote(path: string, content: string): Promise<void>;
  appendNote(path: string, content: string): Promise<void>;
  deleteNote(path: string): Promise<void>;
  searchNotes(query: string, folder?: string): Promise<SearchResult[]>;
}

export interface NoteEntry {
  path: string;
  mtime: number;
  size: number;
}

export interface SearchResult {
  path: string;
  snippet: string;
}

/** Config for local filesystem backend. */
export interface FilesystemConfig {
  type: 'filesystem';
  vaultPath: string;
}

/** Config for CouchDB/LiveSync backend. */
export interface CouchDBConfig {
  type: 'couchdb';
  couchdbUrl: string;
  database?: string;
  passphrase: string;
  pbkdf2Salt?: string;
}

export type VaultConfig = FilesystemConfig | CouchDBConfig;

// ---------------------------------------------------------------------------
// CouchDB / LiveSync document types
// ---------------------------------------------------------------------------

/** LiveSync parent document — represents a vault file. */
export interface LiveSyncNote {
  _id: string;
  _rev: string;
  path: string;
  children?: string[];
  ctime: number;
  mtime: number;
  size: number;
  type: 'plain' | 'newnote' | 'notes';
  eden?: Record<string, { data?: string }>;
  deleted?: boolean;
}

/** LiveSync chunk (leaf) document. */
export interface LiveSyncChunk {
  _id: string;
  _rev?: string;
  data: string;
  type: 'leaf';
  e_?: boolean;
}

/** CouchDB PUT response. */
export interface CouchPutResponse {
  ok?: boolean;
  id?: string;
  rev?: string;
  error?: string;
  reason?: string;
}
