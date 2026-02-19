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
 * Unified Speech Service
 *
 * A high-level factory that wires STTLogic and TTSLogic together so
 * projects can get started with a single object instead of wiring the
 * lower-level primitives manually.
 *
 * @example
 * const service = createSpeechService();
 *
 * service.initializeSTT({
 *   onTranscript: (text) => console.log("Final:", text),
 *   onInterimTranscript: (text) => console.log("Interim:", text),
 *   onStatusChange: (type, data) => console.log(type, data),
 * });
 *
 * await service.initializeTTS({ voiceId: "en_US-hfc_female-medium" });
 *
 * service.startListening();
 * await service.speak("Hello world");
 * service.stopSpeaking();
 */

import {
  STTLogic,
  type ResetSTTOptions,
  type WordUpdateCallback,
  getCompatibilityInfo,
  type CompatibilityInfo,
} from "../stt/stt-logic.js";
import { TTSLogic, type PiperSynthesizerConfig } from "../tts/piper-synthesizer.js";
import { sharedAudioPlayer } from "../tts/audio-player.js";

// ---------------------------------------------------------------------------
// Public option types
// ---------------------------------------------------------------------------

export interface SpeechServiceSTTOptions {
  /**
   * Called with the final transcript after the user stops speaking.
   */
  onTranscript?: (transcript: string) => void;
  /**
   * Called on every interim (non-final) recognition result.
   * Useful for showing live feedback while the user is speaking.
   */
  onInterimTranscript?: (text: string) => void;
  /**
   * General status / log callback.
   * - `type === "log"` — library log message with `{ message, level }`
   * - `type === "speaking"` — user VAD state change; `data` is `boolean`
   */
  onStatusChange?: (
    type: "log" | "speaking",
    data: { message: string; level?: string } | boolean
  ) => void;
  /** Callback for incremental word list updates (real-time word array). */
  onWordsUpdate?: WordUpdateCallback;
  /** Forwarded verbatim to STTLogic / ResetSTTLogic constructor. */
  sttConfig?: Omit<ResetSTTOptions, "onInterimTranscript">;
}

export interface SpeechServiceTTSOptions {
  /** Piper voice ID, e.g. `"en_US-hfc_female-medium"`. */
  voiceId?: string;
  /** Auto-play queued audio immediately (default: `true`). */
  autoPlay?: boolean;
  /** Forwarded verbatim to TTSLogic constructor (overrides voiceId/autoPlay). */
  ttsConfig?: Omit<PiperSynthesizerConfig, "voiceId">;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface SpeechService {
  /**
   * Construct and configure an STTLogic instance.
   * Safe to call before `initializeTTS`.
   */
  initializeSTT(options: SpeechServiceSTTOptions): void;

  /**
   * Construct, initialize (download voice model if needed), and warm up
   * a TTSLogic instance. Must be awaited before calling `speak()`.
   */
  initializeTTS(options?: SpeechServiceTTSOptions): Promise<void>;

  /** Start microphone capture and speech recognition. */
  startListening(): void;

  /**
   * Stop speech recognition.
   * @returns The full transcript collected in this session.
   */
  stopListening(): string;

  /**
   * Synthesize `text` and add it to the shared audio queue.
   * Requires `initializeTTS` to have completed.
   */
  speak(text: string): Promise<void>;

  /** Immediately stop playback and clear the audio queue. */
  stopSpeaking(): void;

  /** Returns browser feature support info (does not require initialization). */
  getCompatibilityInfo(): CompatibilityInfo;

  /** True after `initializeSTT` has been called. */
  readonly sttReady: boolean;
  /** True after `initializeTTS` has resolved successfully. */
  readonly ttsReady: boolean;
}

/**
 * Create a unified SpeechService that manages an STTLogic and TTSLogic
 * instance with a single, ergonomic API.
 */
export function createSpeechService(): SpeechService {
  let stt: STTLogic | null = null;
  let tts: TTSLogic | null = null;
  let _sttReady = false;
  let _ttsReady = false;

  return {
    get sttReady() {
      return _sttReady;
    },
    get ttsReady() {
      return _ttsReady;
    },

    initializeSTT(options: SpeechServiceSTTOptions = {}): void {
      const { onTranscript, onInterimTranscript, onStatusChange, onWordsUpdate, sttConfig } =
        options;

      stt = new STTLogic(
        (message, level) => onStatusChange?.("log", { message, level }),
        (transcript) => onTranscript?.(transcript),
        {
          ...sttConfig,
          onInterimTranscript,
        }
      );

      if (onWordsUpdate) stt.setWordsUpdateCallback(onWordsUpdate);

      stt.setVadCallbacks(
        () => onStatusChange?.("speaking", true),
        () => onStatusChange?.("speaking", false)
      );

      _sttReady = true;
    },

    async initializeTTS(options: SpeechServiceTTSOptions = {}): Promise<void> {
      const { voiceId, autoPlay = true, ttsConfig } = options;

      sharedAudioPlayer.configure({ autoPlay });

      tts = new TTSLogic({
        voiceId,
        warmUp: true,
        ...ttsConfig,
      });
      await tts.initialize();
      _ttsReady = true;
    },

    startListening(): void {
      if (!stt) {
        console.warn("[SpeechService] Call initializeSTT() before startListening()");
        return;
      }
      stt.start();
    },

    stopListening(): string {
      if (!stt) return "";
      stt.stop();
      return stt.getFullTranscript();
    },

    async speak(text: string): Promise<void> {
      if (!tts) {
        console.warn("[SpeechService] Call initializeTTS() before speak()");
        return;
      }
      const result = await tts.synthesize(text);
      sharedAudioPlayer.addAudioIntoQueue(result.audio, result.sampleRate);
    },

    stopSpeaking(): void {
      sharedAudioPlayer.stopAndClearQueue();
    },

    getCompatibilityInfo,
  };
}
