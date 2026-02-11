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
 * Piper TTS Synthesizer using @realtimex/piper-tts-web
 * This library handles text-to-phoneme conversion properly using espeak-ng
 *
 * Note: @realtimex/piper-tts-web handles ONNX Runtime configuration internally,
 * so NO separate ort-setup.js is needed!
 */

import { TtsSession, download, stored, WASM_BASE } from "@realtimex/piper-tts-web";
import { AudioPlayer, sharedAudioPlayer } from "./audio-player";
import { ensureWasmCached, type WasmPaths } from "./wasm-cache.js";

export interface PiperSynthesizerConfig {
  /** Voice ID (e.g., "en_US-hfc_female-medium") */
  voiceId?: string;
  /** Sample rate (default: 22050) */
  sampleRate?: number;
  /** Use shared audio player singleton (default: true) */
  useSharedAudioPlayer?: boolean;
  warmUp?: boolean;
  /**
   * Custom paths for WASM files.  When provided the library will use these
   * URLs directly instead of the CDN, which is useful for self-hosting
   * (e.g. from a `public/piper-wasm/` folder).
   *
   * If omitted the library automatically caches the CDN assets via the
   * Cache API so they are only downloaded once.
   */
  wasmPaths?: WasmPaths;
  /**
   * Disable the automatic Cache API caching of WASM assets.
   * Defaults to `true` (caching enabled).
   */
  enableWasmCache?: boolean;
}

export interface SynthesisResult {
  /** Audio data as WAV Blob */
  audioBlob: Blob;
  /** Audio data as Float32Array (for direct playback) */
  audio: Float32Array;
  /** Sample rate */
  sampleRate: number;
  /** Duration in seconds */
  duration: number;
}

const DEFAULT_VOICE_ID = "en_US-hfc_female-medium";

/**
 * Piper TTS Synthesizer
 * Uses @mintplex-labs/piper-tts-web for proper text-to-speech conversion
 */
export class TTSLogic {
  private config: PiperSynthesizerConfig;
  private ready = false;
  private voiceLoaded = false;
  private audioPlayer?: AudioPlayer;
  private useSharedPlayer: boolean;
  private warmUp: boolean = true;
  private ttsSession: TtsSession | null = null;

  constructor(config: PiperSynthesizerConfig = {}) {
    this.config = {
      voiceId: DEFAULT_VOICE_ID,
      sampleRate: 22050,
      useSharedAudioPlayer: true,
      warmUp: true,
      enableWasmCache: true,
      ...config,
    };
    this.useSharedPlayer = this.config.useSharedAudioPlayer !== false;
  }

  /**
   * Set a custom AudioPlayer (disables shared player for this instance)
   */
  setAudioPlayer(player: AudioPlayer): void {
    this.audioPlayer = player;
    this.useSharedPlayer = false;
  }

  /**
   * Add audio to the queue (uses shared player by default, or custom if set)
   */
  addInternalAudioToQueue(audio: Float32Array, sampleRate?: number): void {
    if (this.audioPlayer) {
      // Use custom player if explicitly set
      this.audioPlayer.addAudioIntoQueue(audio, sampleRate);
    } else if (this.useSharedPlayer) {
      // Use shared singleton player
      sharedAudioPlayer.addAudioIntoQueue(audio, sampleRate);
    }
  }

  async warmup(text = "warmup"): Promise<{ synthesized: boolean }> {
    if (!this.voiceLoaded) {
      throw new Error("Voice not loaded. Call initialize() first.");
    }
    try {
      // Use TtsSession.predict directly to avoid ready check (warmup runs before ready=true)
      if (this.ttsSession) {
        await this.ttsSession.predict(text);
      } else {
        throw new Error("TtsSession not created yet");
      }
      console.log("✓ Piper synthesizer warmed up");
      return { synthesized: true };
    } catch (error) {
      throw new Error(`Failed to warm up Piper synthesizer: ${error}`);
    }
  }

  /**
   * Initialize the synthesizer by loading the voice model
   */
  async initialize(): Promise<void> {
    if (this.ready) return;

    try {
      const voiceId = this.config.voiceId!;
      console.log("📍 Loading Piper voice:", voiceId);

      // --- Step 1: resolve WASM paths (custom, cached, or CDN) ----------
      let wasmPaths: { onnxWasm: string; piperData: string; piperWasm: string };

      if (this.config.wasmPaths) {
        // Consumer provided explicit paths (e.g. self-hosted from public/)
        console.log("📦 Using custom WASM paths");
        wasmPaths = {
          onnxWasm: this.config.wasmPaths.onnxWasm ?? TtsSession.WASM_LOCATIONS.onnxWasm,
          piperData: this.config.wasmPaths.piperData,
          piperWasm: this.config.wasmPaths.piperWasm,
        };
      } else if (this.config.enableWasmCache !== false) {
        // Use Cache API to persist CDN blobs as Blob URLs
        console.log("📦 Caching WASM assets via Cache API...");
        const cached = await ensureWasmCached(WASM_BASE);
        wasmPaths = {
          onnxWasm: TtsSession.WASM_LOCATIONS.onnxWasm,
          piperData: cached.piperData,
          piperWasm: cached.piperWasm,
        };
      } else {
        // Fall back to default CDN URLs (original behaviour)
        wasmPaths = { ...TtsSession.WASM_LOCATIONS };
      }

      // --- Step 2: download / cache the voice model --------------------
      const storedVoices = await stored();
      const alreadyCached = Array.isArray(storedVoices)
        ? storedVoices.includes(voiceId)
        : false;

      if (!alreadyCached) {
        console.log("⬇️ Downloading voice model...");
        await download(voiceId, (progress) => {
          if (progress?.total) {
            const pct = Math.round((progress.loaded * 100) / progress.total);
            console.log(`⬇️ Downloading: ${pct}%`);
          }
        });
      } else {
        console.log("✓ Voice found in cache");
      }

      // --- Step 3: create TtsSession with resolved WASM paths ----------
      this.ttsSession = new TtsSession({
        voiceId: voiceId as any,
        wasmPaths,
        logger: (msg) => console.log(`[piper] ${msg}`),
      });
      await this.ttsSession.waitReady;

      this.voiceLoaded = true;

      if (this.config.warmUp) {
        const { synthesized } = await this.warmup();
        if (!synthesized) {
          throw new Error(
            "Failed to warm up Piper synthesizer. Please check the voice model and try again."
          );
        }
      }
      this.ready = true;
      console.log("✓ Piper synthesizer initialized");
    } catch (error) {
      throw new Error(`Failed to initialize Piper synthesizer: ${error}`);
    }
  }

  /**
   * Check if the synthesizer is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Synthesize speech from text
   * @param text - Text to convert to speech
   * @returns Audio data as WAV Blob and Float32Array
   */
  async synthesize(text: string): Promise<SynthesisResult> {
    if (!this.ready) {
      throw new Error("Synthesizer not initialized. Call initialize() first.");
    }

    const trimmed = text?.trim();
    if (!trimmed) {
      throw new Error("No text provided for synthesis");
    }

    try {
      // Use TtsSession directly — WASM paths were already resolved during
      // initialize() so Emscripten reads from blob: URLs / local paths
      // instead of re-downloading from the CDN.
      const wavBlob: Blob = await this.ttsSession!.predict(trimmed);

      // Convert Blob to Float32Array for direct playback
      const arrayBuffer = await wavBlob.arrayBuffer();
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const audioData = decodedBuffer.getChannelData(0);
      audioContext.close();

      return {
        audioBlob: wavBlob,
        audio: audioData,
        sampleRate: decodedBuffer.sampleRate,
        duration: decodedBuffer.duration,
      };
    } catch (error) {
      throw new Error(`Synthesis failed: ${error}`);
    }
  }

  /**
   * Synthesize and return WAV Blob only (faster, no decoding)
   */
  async synthesizeToBlob(text: string): Promise<Blob> {
    if (!this.ready) {
      throw new Error("Synthesizer not initialized. Call initialize() first.");
    }

    const trimmed = text?.trim();
    if (!trimmed) {
      throw new Error("No text provided for synthesis");
    }

    return this.ttsSession!.predict(trimmed);
  }

  /**
   * Synthesize text and add to queue (uses shared player by default)
   */
  async synthesizeAndAddToQueue(text: string): Promise<void> {
    if (!this.audioPlayer && !this.useSharedPlayer) {
      throw new Error("No AudioPlayer set and shared player is disabled");
    }
    const result = await this.synthesize(text);
    this.addInternalAudioToQueue(result.audio, result.sampleRate);
  }

  /**
   * Stop current synthesis (not directly supported, but we can track state)
   */
  stop(): void {
    // Piper doesn't have a stop method, but we track state
    console.log("Stop requested");
  }

  /**
   * Dispose of the synthesizer and free resources
   */
  async dispose(): Promise<void> {
    this.ready = false;
    this.voiceLoaded = false;
    this.ttsSession = null;
    // Note: TtsSession is a singleton in the upstream library so it
    // persists across instances.  We null out our reference to allow GC
    // but the global singleton will remain until the page is reloaded.
  }
}

/**
 * Create and initialize a Piper synthesizer
 */
// export async function createPiperSynthesizer(
//   config: PiperSynthesizerConfig = {}
// ): Promise<PiperSynthesizer> {
//   const synthesizer = new PiperSynthesizer(config);
//   await synthesizer.initialize();
//   return synthesizer;
// }

/**
 * @deprecated Use PiperSynthesizer.synthesize() which handles text-to-phoneme internally
 * This is kept for backwards compatibility but should not be used directly
 */
export function textToPhonemes(_text: string): number[] {
  console.warn(
    "textToPhonemes is deprecated. Use PiperSynthesizer.synthesize(text) instead."
  );
  return [];
}
