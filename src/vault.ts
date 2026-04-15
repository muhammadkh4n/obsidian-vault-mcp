/**
 * Vault factory — creates the appropriate backend from config.
 */

export type { VaultBackend } from './types.js';
export { LocalVault } from './backends/filesystem.js';
export { CouchDBVault } from './backends/couchdb.js';
