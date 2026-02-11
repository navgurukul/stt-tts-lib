/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * WASM Cache Module
 *
 * Caches piper_phonemize.data and piper_phonemize.wasm in the browser's
 * Cache API to avoid re-downloading ~9MB on every TTS synthesis call.
 *
 * The Emscripten runtime used by piper-tts-web calls `locateFile()` on every
 * `predict()` invocation, generating fresh XHR requests for the WASM assets
 * even when the CDN returns immutable cache headers.  By pre-fetching the
 * blobs and handing back Blob URLs, the Emscripten loader reads from memory
 * without touching the network.
 */

const CACHE_NAME = "stt-tts-lib-piper-wasm-v1";

const DEFAULT_CDN_BASE =
  "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize";

export interface WasmPaths {
  piperData: string;
  piperWasm: string;
  onnxWasm?: string;
}

export interface WasmCacheResult {
  /** URL (blob: or original) for piper_phonemize.data */
  piperData: string;
  /** URL (blob: or original) for piper_phonemize.wasm */
  piperWasm: string;
}

// Keep blob URLs alive for the page lifetime so they don't get revoked
let cachedBlobUrls: WasmCacheResult | null = null;

/**
 * Returns true if the Cache API is available in the current environment.
 */
function isCacheAvailable(): boolean {
  return typeof caches !== "undefined";
}

/**
 * Fetch a single asset, cache it, and return a Blob URL.
 */
async function fetchAndCache(
  cache: Cache,
  url: string,
): Promise<string> {
  // Check if already in the cache
  const existing = await cache.match(url);
  if (existing) {
    const blob = await existing.blob();
    return URL.createObjectURL(blob);
  }

  // Fetch from network
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  // Clone the response so we can cache the original and read the blob from the clone
  const responseForCache = response.clone();
  await cache.put(url, responseForCache);

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Pre-fetch and cache the piper WASM assets, returning Blob URLs.
 *
 * On first call the files are fetched from the CDN (or the provided
 * `cdnBase`) and stored in the Cache API.  Subsequent calls return Blob
 * URLs created from the cached responses instantly.
 *
 * If the Cache API is not available the original CDN URLs are returned
 * (falling back to default behaviour).
 *
 * @param cdnBase  Base URL without the file extension,
 *                 e.g. `"https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize"`
 */
export async function ensureWasmCached(
  cdnBase: string = DEFAULT_CDN_BASE,
): Promise<WasmCacheResult> {
  // Return memoised blob URLs if we already created them this session
  if (cachedBlobUrls) return cachedBlobUrls;

  const dataUrl = `${cdnBase}.data`;
  const wasmUrl = `${cdnBase}.wasm`;

  if (!isCacheAvailable()) {
    console.log("[wasm-cache] Cache API unavailable — using CDN URLs directly");
    cachedBlobUrls = { piperData: dataUrl, piperWasm: wasmUrl };
    return cachedBlobUrls;
  }

  try {
    const cache = await caches.open(CACHE_NAME);

    const [piperData, piperWasm] = await Promise.all([
      fetchAndCache(cache, dataUrl),
      fetchAndCache(cache, wasmUrl),
    ]);

    cachedBlobUrls = { piperData, piperWasm };
    console.log("[wasm-cache] WASM assets served from Cache API (blob URLs)");
    return cachedBlobUrls;
  } catch (err) {
    console.warn("[wasm-cache] Caching failed, falling back to CDN URLs:", err);
    cachedBlobUrls = { piperData: dataUrl, piperWasm: wasmUrl };
    return cachedBlobUrls;
  }
}

/**
 * Check whether the piper WASM files are already present in the Cache API.
 */
export async function isWasmCached(
  cdnBase: string = DEFAULT_CDN_BASE,
): Promise<boolean> {
  if (!isCacheAvailable()) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    const [data, wasm] = await Promise.all([
      cache.match(`${cdnBase}.data`),
      cache.match(`${cdnBase}.wasm`),
    ]);
    return !!data && !!wasm;
  } catch {
    return false;
  }
}

/**
 * Remove all piper WASM assets from the Cache API.
 */
export async function clearWasmCache(): Promise<void> {
  // Revoke any outstanding blob URLs
  if (cachedBlobUrls) {
    try { URL.revokeObjectURL(cachedBlobUrls.piperData); } catch { /* noop */ }
    try { URL.revokeObjectURL(cachedBlobUrls.piperWasm); } catch { /* noop */ }
    cachedBlobUrls = null;
  }

  if (!isCacheAvailable()) return;
  try {
    await caches.delete(CACHE_NAME);
    console.log("[wasm-cache] Cache cleared");
  } catch (err) {
    console.warn("[wasm-cache] Failed to clear cache:", err);
  }
}
