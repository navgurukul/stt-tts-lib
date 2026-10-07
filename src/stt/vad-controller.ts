/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 */

import {
  MicVAD,
  getDefaultRealTimeVADOptions,
  type RealTimeVADOptions,
} from "@ricky0123/vad-web";
import * as ort from "onnxruntime-web/wasm";

export type VadAssetPaths = {
  /** Directory containing vad worklet/assets (trailing slash recommended). */
  baseAssetPath?: string;
  /** ONNX runtime WASM path prefix (trailing slash recommended). */
  onnxWASMBasePath?: string;
};

export type VADControllerOptions = {
  minSpeechMs?: number;
  minSilenceMs?: number;
  positiveSpeechThreshold?: number;
  negativeSpeechThreshold?: number;
  assetPaths?: VadAssetPaths;
};

/**
 * Neural mic VAD (@ricky0123/vad-web). Framework-agnostic; used by STS when
 * `enableVAD` is true to gate Web Speech start/stop on real human speech.
 */
export class VADController {
  private vad: MicVAD | null = null;
  private vadInit: Promise<MicVAD> | null = null;
  private voiceStartListeners = new Set<() => void>();
  private voiceStopListeners = new Set<() => void>();
  private voiceMisfireListeners = new Set<() => void>();
  private running = false;
  private readonly options?: VADControllerOptions;

  constructor(options?: VADControllerOptions) {
    this.options = options;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new Error("Microphone access is not available.");
    }
  }

  private getOnnxWasmBasePath(): string {
    return this.options?.assetPaths?.onnxWASMBasePath ?? "/ort/";
  }

  private configureOrt(): void {
    const wasmPaths = this.getOnnxWasmBasePath();
    ort.env.wasm.wasmPaths = wasmPaths;
    // Safer under COEP / dev servers; avoids threaded WASM import hangs.
    ort.env.wasm.numThreads = 1;
    ort.env.logLevel = "warning";
  }

  private buildVadOptions(): RealTimeVADOptions {
    const defaults = getDefaultRealTimeVADOptions("v5");
    const baseAssetPath = this.options?.assetPaths?.baseAssetPath ?? "/vad/";
    const onnxWASMBasePath = this.getOnnxWasmBasePath();

    return {
      ...defaults,
      model: "v5",
      minSpeechMs: this.options?.minSpeechMs ?? 400,
      redemptionMs: this.options?.minSilenceMs ?? 1200,
      positiveSpeechThreshold:
        this.options?.positiveSpeechThreshold ??
        defaults.positiveSpeechThreshold,
      negativeSpeechThreshold:
        this.options?.negativeSpeechThreshold ??
        defaults.negativeSpeechThreshold,
      startOnLoad: false,
      processorType: "ScriptProcessor",
      onSpeechStart: () => {
        // Early hint only — STT gating uses onSpeechRealStart (validated speech).
      },
      onSpeechRealStart: () => this.emitVoiceStart(),
      onSpeechEnd: () => this.emitVoiceStop(),
      onVADMisfire: () => this.emitVoiceMisfire(),
      baseAssetPath,
      onnxWASMBasePath,
      ortConfig: (ortInstance) => {
        try {
          ortInstance.env.logLevel = "warning";
          ortInstance.env.wasm.numThreads = 1;
        } catch {
          // ignore
        }
      },
    };
  }

  /**
   * Load ONNX model + ORT WASM (no microphone yet). Call during STS init.
   */
  public async prepare(): Promise<void> {
    await this.getOrCreateVad();
  }

  private async getOrCreateVad(): Promise<MicVAD> {
    if (this.vad) return this.vad;
    if (!this.vadInit) {
      this.configureOrt();
      this.vadInit = MicVAD.new(this.buildVadOptions())
        .then((vad) => {
          this.vad = vad;
          return vad;
        })
        .catch((error) => {
          this.vadInit = null;
          throw error;
        });
    }
    return this.vadInit;
  }

  public async start(): Promise<void> {
    const vad = await this.getOrCreateVad();
    if (vad.listening) {
      this.running = true;
      return;
    }
    await vad.start();
    this.running = true;
  }

  public stop(): void {
    if (!this.running || !this.vad) return;
    try {
      void this.vad.pause();
      this.running = false;
    } catch {
      this.running = false;
    }
  }

  public destroy(): void {
    this.stop();
    if (this.vad) {
      try {
        void this.vad.destroy();
      } catch {
        // ignore
      }
      this.vad = null;
    }
    this.vadInit = null;
    this.voiceStartListeners.clear();
    this.voiceStopListeners.clear();
    this.voiceMisfireListeners.clear();
  }

  public isActive(): boolean {
    return this.running && this.vad !== null && this.vad.listening;
  }

  public onVoiceStart(listener: () => void): () => void {
    this.voiceStartListeners.add(listener);
    return () => this.voiceStartListeners.delete(listener);
  }

  public onVoiceStop(listener: () => void): () => void {
    this.voiceStopListeners.add(listener);
    return () => this.voiceStopListeners.delete(listener);
  }

  public onVoiceMisfire(listener: () => void): () => void {
    this.voiceMisfireListeners.add(listener);
    return () => this.voiceMisfireListeners.delete(listener);
  }

  private emitVoiceStart(): void {
    for (const listener of this.voiceStartListeners) {
      try {
        listener();
      } catch (error) {
        console.error("Error in voice start listener:", error);
      }
    }
  }

  private emitVoiceStop(): void {
    for (const listener of this.voiceStopListeners) {
      try {
        listener();
      } catch (error) {
        console.error("Error in voice stop listener:", error);
      }
    }
  }

  private emitVoiceMisfire(): void {
    for (const listener of this.voiceMisfireListeners) {
      try {
        listener();
      } catch (error) {
        console.error("Error in voice misfire listener:", error);
      }
    }
  }
}

/** Alias matching common consumer naming. */
export { VADController as VoiceActivityDetector };
