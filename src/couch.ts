/**
 * CouchDB HTTP helpers — supports both http and https.
 */

import * as http from 'node:http';
import * as https from 'node:https';
import type { CouchPutResponse } from './types.js';

function getModule(url: string): typeof http | typeof https {
  return url.startsWith('https') ? https : http;
}

export function couchGet<T>(url: string): Promise<T> {
  const mod = getModule(url);
  return new Promise((resolve, reject) => {
    mod.get(url, { timeout: 15_000 }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch (err) {
          reject(new Error(`CouchDB JSON parse error: ${(err as Error).message}`));
        }
      });
    }).on('error', reject)
      .on('timeout', function(this: http.ClientRequest) { this.destroy(new Error('CouchDB request timed out')); });
  });
}

export function couchPut(url: string, body: Record<string, unknown>): Promise<CouchPutResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const mod = getModule(url);

    const opts: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'PUT',
      timeout: 15_000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    if (parsed.username) {
      opts.auth = `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`;
    }

    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as CouchPutResponse);
        } catch (err) {
          reject(new Error(`CouchDB PUT parse error: ${(err as Error).message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('CouchDB PUT timed out')); });
    req.write(payload);
    req.end();
  });
}

export function couchDelete(url: string): Promise<CouchPutResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = getModule(url);

    const opts: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'DELETE',
      timeout: 15_000,
      headers: { 'Content-Type': 'application/json' },
    };
    if (parsed.username) {
      opts.auth = `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`;
    }

    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        try { resolve(JSON.parse(data) as CouchPutResponse); }
        catch (err) { reject(new Error(`CouchDB DELETE parse error: ${(err as Error).message}`)); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('CouchDB DELETE timed out')); });
    req.end();
  });
}
