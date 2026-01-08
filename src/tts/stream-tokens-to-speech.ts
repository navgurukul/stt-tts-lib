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

export interface StreamTokensOptions {
  chunkSize?: number;
  delayMs?: number;
  onChunk?: (text: string) => Promise<void> | void;
}

export interface StreamTokensResult {
  chunksEmitted: number;
  characters: number;
}

function isAsyncIterable<T>(value: AsyncIterable<T> | Iterable<T>): value is AsyncIterable<T> {
  return typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === "function";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Convert incremental tokens to speech-sized chunks. Consumers can bridge this into an audio renderer.
 */
export async function streamTokensToSpeech(
  tokens: AsyncIterable<string> | Iterable<string>,
  options: StreamTokensOptions = {},
): Promise<StreamTokensResult> {
  const chunkSize = options.chunkSize ?? 40;
  const delayMs = options.delayMs ?? 0;

  let buffer = "";
  let chunksEmitted = 0;
  let characters = 0;

  const emit = async () => {
    if (!buffer) return;
    characters += buffer.length;
    chunksEmitted += 1;
    if (options.onChunk) {
      await options.onChunk(buffer);
    }
    buffer = "";
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  };

  if (isAsyncIterable(tokens)) {
    for await (const token of tokens) {
      buffer += token;
      if (buffer.length >= chunkSize) {
        await emit();
      }
    }
  } else {
    for (const token of tokens) {
      buffer += token;
      if (buffer.length >= chunkSize) {
        await emit();
      }
    }
  }

  if (buffer) {
    await emit();
  }

  return { chunksEmitted, characters };
}
