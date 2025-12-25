import { streamTokensToSpeech } from "./stream-tokens-to-speech.js";
import {
  ensureOrtReady,
  ensureVoiceLoaded,
  handleChunk,
  SimpleQueue,
  synthesizerWorker,
  playerWorker,
  getAsyncIterator,
  emitSentence,
} from "./piper.js";
import type { PiperVoiceConfig, PreparedPiperVoice } from "./prepare-piper-voice.js";
import type { OrtEnvironmentConfig } from "./ort-setup.js";
import type { SynthResult, Synthesizer, Player } from "./piper.js";

export interface StreamingTTSOptions {
  voice: PiperVoiceConfig;
  ort?: OrtEnvironmentConfig;
  synth?: Synthesizer;
  play?: Player;
  chunkSize?: number;
  delayMs?: number;
}

export interface StreamingTTSController {
  ensureReady(): Promise<void>;
  addChunk(text: string): Promise<void>;
  finishStreaming(): Promise<void>;
  stop(): void;
  synthAndPlayChunk(text: string): Promise<void>;
  processQueue(): Promise<void>;
  createTokenIterable(text: string): Iterable<string>;
}

const defaultSynth: Synthesizer = async (text) => text;
const defaultPlayer: Player = async () => undefined;

export function useStreamingTTS(options: StreamingTTSOptions): StreamingTTSController {
  const textQueue = new SimpleQueue<string>();
  const audioQueue = new SimpleQueue<SynthResult>();
  const bufferState = { buffer: "" };

  let ready = false;
  let stopped = false;
  let voice: PreparedPiperVoice | null = null;

  const synth = options.synth ?? defaultSynth;
  const play = options.play ?? defaultPlayer;
  const chunkSize = options.chunkSize ?? 48;
  const delayMs = options.delayMs ?? 0;

  async function ensureReady(): Promise<void> {
    if (ready) return;
    await ensureOrtReady(options.ort ?? {});
    voice = await ensureVoiceLoaded(options.voice);
    ready = true;
  }

  async function addChunk(text: string): Promise<void> {
    handleChunk(bufferState, text, textQueue);
    if (bufferState.buffer.length >= chunkSize) {
      emitSentence(textQueue, bufferState.buffer);
      bufferState.buffer = "";
    }
  }

  async function finishStreaming(): Promise<void> {
    if (bufferState.buffer) {
      emitSentence(textQueue, bufferState.buffer);
      bufferState.buffer = "";
    }
  }

  function stop(): void {
    stopped = true;
  }

  async function synthAndPlayChunk(text: string): Promise<void> {
    await ensureReady();
    const audio = await synth(text, voice as PreparedPiperVoice);
    await play(audio);
  }

  async function processQueue(): Promise<void> {
    await ensureReady();
    const tokenIterator = getAsyncIterator(textQueue as AsyncIterable<string>);
    const audioIterator = synthesizerWorker(tokenIterator, options.voice, synth);
    await playerWorker(audioIterator, play);
  }

  function createTokenIterable(text: string): Iterable<string> {
    return text.split(/\s+/g).filter(Boolean);
  }

  async function streamTokens(tokens: AsyncIterable<string> | Iterable<string>): Promise<void> {
    await ensureReady();
    await streamTokensToSpeech(tokens, {
      chunkSize,
      delayMs,
      onChunk: async (chunk) => {
        if (stopped) return;
        await synthAndPlayChunk(chunk);
      },
    });
  }

  // Kick off background processors
  processQueue().catch(() => undefined);
  streamTokens(textQueue as AsyncIterable<string>).catch(() => undefined);

  return {
    ensureReady,
    addChunk,
    finishStreaming,
    stop,
    synthAndPlayChunk,
    processQueue,
    createTokenIterable,
  };
}
