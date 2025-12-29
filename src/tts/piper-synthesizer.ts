/**
 * Piper TTS Synthesizer using @realtimex/piper-tts-web
 * This library handles text-to-phoneme conversion properly using espeak-ng
 *
 * Note: @realtimex/piper-tts-web handles ONNX Runtime configuration internally,
 * so NO separate ort-setup.js is needed!
 */

import * as piperTts from "@realtimex/piper-tts-web";

export interface PiperSynthesizerConfig {
  /** Voice ID (e.g., "en_US-hfc_female-medium") */
  voiceId?: string;
  /** Sample rate (default: 22050) */
  sampleRate?: number;
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

  constructor(config: PiperSynthesizerConfig = {}) {
    this.config = {
      voiceId: DEFAULT_VOICE_ID,
      sampleRate: 22050,
      ...config,
    };
  }

  /**
   * Initialize the synthesizer by loading the voice model
   */
  async initialize(): Promise<void> {
    if (this.ready) return;

    try {
      const voiceId = this.config.voiceId!;
      console.log("📍 Loading Piper voice:", voiceId);

      // Check if voice is already cached
      const storedVoices = await piperTts.stored();
      const alreadyCached = Array.isArray(storedVoices)
        ? storedVoices.includes(voiceId)
        : false;

      if (!alreadyCached) {
        console.log("⬇️ Downloading voice model...");
        await piperTts.download(voiceId, (progress) => {
          if (progress?.total) {
            const pct = Math.round((progress.loaded * 100) / progress.total);
            console.log(`⬇️ Downloading: ${pct}%`);
          }
        });
      } else {
        console.log("✓ Voice found in cache");
      }

      this.voiceLoaded = true;
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
      // Use piper-tts-web to convert text to speech
      // This handles text-to-phoneme conversion internally using espeak-ng
      const wavBlob: Blob = await piperTts.predict({
        text: trimmed,
        voiceId: this.config.voiceId!,
      });

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

    return piperTts.predict({
      text: trimmed,
      voiceId: this.config.voiceId!,
    });
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
