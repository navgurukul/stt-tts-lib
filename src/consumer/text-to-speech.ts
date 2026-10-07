/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 */

import { TTSLogic } from "../tts/piper-synthesizer.js";
import { ensureWasmCached } from "../tts/wasm-cache.js";
import { speechRuntime } from "./runtime.js";
import { useSharedAudioPlayer } from "./shared-audio-player.js";
import type {
  SharedAudioPlayer,
  TextToSpeechControls,
  TextToSpeechInitConfig,
} from "./types.js";

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Download voice model and WASM assets. Call early (e.g. on app load) before `useTextToSpeech`.
 */
export async function initializeTextToSpeech(
  config: TextToSpeechInitConfig,
): Promise<void> {
  speechRuntime.ttsInit = config;

  const player = useSharedAudioPlayer();
  const playerConfig: {
    autoPlay: boolean;
    sampleRate?: number;
    volume?: number;
  } = {
    autoPlay: config.autoPlay ?? true,
  };
  if (config.sampleRate !== undefined) {
    playerConfig.sampleRate = config.sampleRate;
  }
  if (config.volume !== undefined) {
    playerConfig.volume = config.volume;
  }
  player.configure(playerConfig);

  if (config.enableWasmCache !== false) {
    const base = config.wasmPaths?.piperWasm.replace(/\.wasm$/, "");
    await ensureWasmCached(base);
  }

  if (speechRuntime.tts) {
    speechRuntime.tts = null;
  }

  speechRuntime.tts = new TTSLogic({
    voiceId: config.voiceId,
    wasmPaths: config.wasmPaths,
    enableWasmCache: config.enableWasmCache,
    sampleRate: config.sampleRate,
    useSharedAudioPlayer: true,
    warmUp: true,
  });

  await speechRuntime.tts.initialize();
  speechRuntime.ttsReady = true;
}

export async function prefetchTextToSpeechAssets(
  config: Pick<TextToSpeechInitConfig, "wasmPaths" | "enableWasmCache"> & {
    voiceId?: string;
  } = {},
): Promise<void> {
  if (config.wasmPaths) {
    const base = config.wasmPaths.piperWasm.replace(/\.wasm$/, "");
    await ensureWasmCached(base);
  } else {
    await ensureWasmCached();
  }

  if (config.voiceId) {
    const { prefetchTTSModel } = await import("../tts/piper-synthesizer.js");
    await prefetchTTSModel(config.voiceId);
  }
}

export function useTextToSpeech(options?: {
  player?: SharedAudioPlayer;
}): TextToSpeechControls {
  const player = options?.player ?? useSharedAudioPlayer();

  const requireTts = (): TTSLogic => {
    if (!speechRuntime.tts || !speechRuntime.ttsReady) {
      throw new Error(
        "Text-to-speech is not ready. Call initializeTextToSpeech() first.",
      );
    }
    return speechRuntime.tts;
  };

  return {
    isReady: () => speechRuntime.ttsReady,
    speak: async (text: string) => {
      const tts = requireTts();
      const result = await tts.synthesize(text);
      player.enqueue(result.audio, result.sampleRate);
    },
    speakSentences: async (text: string) => {
      const tts = requireTts();
      const sentences = splitIntoSentences(text);
      const chunks = sentences.length > 0 ? sentences : [text.trim()];
      for (const sentence of chunks) {
        if (!sentence) continue;
        const result = await tts.synthesize(sentence);
        player.enqueue(result.audio, result.sampleRate);
      }
    },
    stopSpeaking: () => player.stopAndClear(),
  };
}
