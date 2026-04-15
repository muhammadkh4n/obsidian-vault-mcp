/**
 * LiveSync E2E Encryption — PBKDF2 + HKDF + AES-256-GCM
 *
 * Verbatim from vps-agent obsidian-watcher.ts.
 * DO NOT MODIFY — any byte-level change breaks encryption compatibility.
 */

import * as crypto from 'node:crypto';

export class LiveSyncCrypto {
  private readonly passphrase: string;
  private readonly pbkdf2Salt: Buffer;
  private masterKeyCache: Buffer | null = null;

  constructor(passphrase: string, pbkdf2SaltB64: string) {
    this.passphrase = passphrase;
    this.pbkdf2Salt = Buffer.from(pbkdf2SaltB64, 'base64');
  }

  /**
   * Derive the PBKDF2 master key (cached — same for all chunks).
   * 310,000 iterations of PBKDF2-SHA256.
   */
  private getMasterKey(): Buffer {
    if (!this.masterKeyCache) {
      this.masterKeyCache = crypto.pbkdf2Sync(
        this.passphrase,
        this.pbkdf2Salt,
        310_000,
        32,
        'sha256',
      );
    }
    return this.masterKeyCache;
  }

  /**
   * Decrypt a single chunk's data field.
   * Supports `%=` prefix (HKDF scheme — current LiveSync default).
   */
  decrypt(data: string): string {
    if (!data.startsWith('%=')) {
      throw new Error(`Unsupported encryption prefix: ${data.slice(0, 5)}`);
    }

    const binary = Buffer.from(data.slice(2), 'base64');
    const iv = binary.subarray(0, 12);
    const hkdfSalt = binary.subarray(12, 44);
    const ciphertext = binary.subarray(44);

    const masterKey = this.getMasterKey();
    const hkdfKey = Buffer.from(
      crypto.hkdfSync('sha256', masterKey, hkdfSalt, Buffer.alloc(0), 32),
    );

    const authTag = ciphertext.subarray(-16);
    const encData = ciphertext.subarray(0, -16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', hkdfKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encData),
      decipher.final(),
    ]).toString('utf-8');
  }

  /**
   * Encrypt plaintext into LiveSync `%=` format.
   * Generates random IV (12 bytes) and HKDF salt (32 bytes) per call.
   * Returns: `%=` + base64(IV | HKDF_salt | ciphertext + GCM_tag)
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const hkdfSalt = crypto.randomBytes(32);

    const masterKey = this.getMasterKey();
    const hkdfKey = Buffer.from(
      crypto.hkdfSync('sha256', masterKey, hkdfSalt, Buffer.alloc(0), 32),
    );

    const cipher = crypto.createCipheriv('aes-256-gcm', hkdfKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const blob = Buffer.concat([iv, hkdfSalt, encrypted, authTag]);
    return '%=' + blob.toString('base64');
  }
}
