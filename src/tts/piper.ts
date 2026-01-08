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

import { createOrtEnvironment, OrtEnvironment, OrtEnvironmentConfig } from "./ort-setup.js";
import { preparePiperVoice, PiperVoiceConfig, PreparedPiperVoice } from "./prepare-piper-voice.js";

export type SynthResult = string | ArrayBuffer | Uint8Array;
export type Synthesizer = (text: string, voice: PreparedPiperVoice) => Promise<SynthResult>;
export type Player = (audio: SynthResult) => Promise<void>;

const voiceCache = new Map<string, PreparedPiperVoice>();
let ortEnv: OrtEnvironment | null = null;

export async function ensureOrtReady(config: OrtEnvironmentConfig = {}): Promise<OrtEnvironment> {
  if (ortEnv) return ortEnv;
  ortEnv = await createOrtEnvironment(config);
  return ortEnv;
}

export async function ensureVoiceLoaded(config: PiperVoiceConfig): Promise<PreparedPiperVoice> {
  const cached = voiceCache.get(config.voiceId);
  if (cached) return cached;
  const voice = preparePiperVoice(config);
  voiceCache.set(config.voiceId, voice);
  return voice;
}

export async function warmupPiper(
  voiceConfig: PiperVoiceConfig,
  synth: Synthesizer,
  text = "warmup",
): Promise<void> {
  const voice = await ensureVoiceLoaded(voiceConfig);
  await synth(text, voice);
}

export function resetVoiceCache(): void {
  voiceCache.clear();
}

export function getBackendLabel(device: string | undefined): string {
  if (!device) return "auto";
  return device === "webgpu" ? "WebGPU" : "CPU";
}

export function isCorruptModelError(error: unknown): boolean {
  if (!error) return false;
  const msg = typeof error === "string" ? error : (error as { message?: string }).message;
  if (!msg) return false;
  return /corrupt|checksum|integrity/i.test(msg);
}

// ---------------------------------------------------------------------------
// Workers and helpers
// ---------------------------------------------------------------------------

export async function* synthesizerWorker(
  textQueue: AsyncIterable<string>,
  voiceConfig: PiperVoiceConfig,
  synth: Synthesizer,
): AsyncGenerator<SynthResult, void, unknown> {
  const voice = await ensureVoiceLoaded(voiceConfig);
  for await (const text of textQueue) {
    yield synth(text, voice);
  }
}

export async function playerWorker(
  audioQueue: AsyncIterable<SynthResult>,
  play: Player,
): Promise<void> {
  for await (const audio of audioQueue) {
    await play(audio);
  }
}

export function nextBoundaryIndex(text: string): number {
  const idx = text.search(/[.!?,]/);
  return idx >= 0 ? idx : -1;
}

export function emitSentence(queue: SimpleQueue<string>, sentence: string): void {
  const trimmed = sentence.trim();
  if (trimmed) {
    queue.put(trimmed);
  }
}

export function handleChunk(state: { buffer: string }, chunk: string, queue: SimpleQueue<string>): void {
  state.buffer += chunk;
  let boundary = nextBoundaryIndex(state.buffer);
  while (boundary >= 0) {
    const sentence = state.buffer.slice(0, boundary + 1);
    state.buffer = state.buffer.slice(boundary + 1);
    emitSentence(queue, sentence);
    boundary = nextBoundaryIndex(state.buffer);
  }
}

export function getAsyncIterator<T>(
  source: AsyncIterable<T> | Iterable<T>,
): AsyncIterable<T> {
  if ((source as AsyncIterable<T>)[Symbol.asyncIterator]) {
    return source as AsyncIterable<T>;
  }
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of source as Iterable<T>) {
        yield item;
      }
    },
  };
}

export class SimpleQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private resolvers: Array<(value: IteratorResult<T>) => void> = [];

  put(item: T): void {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      resolve?.({ value: item, done: false });
    } else {
      this.buffer.push(item);
    }
  }

  size(): number {
    return this.buffer.length;
  }

  async get(): Promise<T> {
    if (this.buffer.length > 0) {
      return this.buffer.shift() as T;
    }
    return new Promise<T>((resolve) => {
      this.resolvers.push(({ value }) => resolve(value as T));
    });
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      const value = await this.get();
      yield value;
    }
  }
}
