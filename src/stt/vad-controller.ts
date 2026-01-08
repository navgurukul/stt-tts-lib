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

import { MicVAD, getDefaultRealTimeVADOptions } from "@ricky0123/vad-web";

export type VADControllerOptions = {
  bufferSize?: number;
  minSpeechMs?: number;
  minSilenceMs?: number;
  energyThreshold?: number;
  dynamicThresholdFactor?: number;
  noiseFloorSmoothing?: number;
  noiseFloorDecay?: number;
  maxAmplitude?: number;
};

export class VADController {
  private vad: MicVAD | null = null;
  private voiceStartListeners = new Set<() => void>();
  private voiceStopListeners = new Set<() => void>();
  private running = false;
  private options?: VADControllerOptions;

  constructor(options?: VADControllerOptions) {
    this.options = options;
  }

  public async start(): Promise<void> {
    if (this.running && this.vad) {
      if (!this.vad.listening) {
        await this.vad.start();
      }
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error("Microphone access is not available.");
    }

    try {
      const ortAny = (window as any).ort;
      if (ortAny && ortAny.env && ortAny.env.wasm) {
        ortAny.env.wasm.wasmPaths = "/ort/";
      }

      if (!this.vad) {
        const defaultOptions = getDefaultRealTimeVADOptions("v5");

        // Configure custom options
        this.vad = await MicVAD.new({
          ...defaultOptions,
          startOnLoad: false,
          onSpeechStart: () => {
            this.emitVoiceStart();
          },
          onSpeechEnd: (audio: Float32Array) => {
            this.emitVoiceStop();
          },
          onVADMisfire: () => {},
          minSpeechMs: this.options?.minSpeechMs || 150,
          positiveSpeechThreshold: 0.5,
          negativeSpeechThreshold: 0.35,
          redemptionMs: this.options?.minSilenceMs || 450,
          preSpeechPadMs: 50,
          processorType: "ScriptProcessor",

          onnxWASMBasePath: "/ort/",
          baseAssetPath: "/vad/",
          workletOptions: {},
        });
      }

      if (!this.vad.listening) {
        await this.vad.start();
      }

      this.running = true;
    } catch (error: any) {
      this.running = false;
      throw new Error(
        error?.message || "Failed to initialize voice activity detector"
      );
    }
  }

  public stop(): void {
    if (!this.running || !this.vad) return;
    try {
      this.vad.pause();
      this.running = false;
    } catch (error) {}
  }

  public destroy(): void {
    this.stop();
    if (this.vad) {
      try {
        this.vad.destroy();
      } catch (error) {}
      this.vad = null;
    }
    this.voiceStartListeners.clear();
    this.voiceStopListeners.clear();
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

  private emitVoiceStart(): void {
    this.voiceStartListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error("Error in voice start listener:", error);
      }
    });
  }

  private emitVoiceStop(): void {
    this.voiceStopListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error("Error in voice stop listener:", error);
      }
    });
  }
}
