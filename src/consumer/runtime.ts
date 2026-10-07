/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 */

import type { STTLogic } from "../stt/stt-logic.js";
import type { VADController } from "../stt/vad-controller.js";
import type { TTSLogic } from "../tts/piper-synthesizer.js";
import type {
  SpeechToSpeechInitConfig,
  SpeechToTextInitConfig,
  TextToSpeechInitConfig,
} from "./types.js";

export interface SpeechRuntime {
  sttInit: SpeechToTextInitConfig | null;
  ttsInit: TextToSpeechInitConfig | null;
  stsInit: SpeechToSpeechInitConfig | null;
  stt: STTLogic | null;
  tts: TTSLogic | null;
  ttsReady: boolean;
  vad: VADController | null;
}

export const speechRuntime: SpeechRuntime = {
  sttInit: null,
  ttsInit: null,
  stsInit: null,
  stt: null,
  tts: null,
  ttsReady: false,
  vad: null,
};

export function resetSpeechRuntime(): void {
  if (speechRuntime.stt) {
    try {
      speechRuntime.stt.destroy();
    } catch {
      /* ignore */
    }
  }
  speechRuntime.stt = null;
  speechRuntime.tts = null;
  speechRuntime.ttsReady = false;
  speechRuntime.vad?.destroy();
  speechRuntime.vad = null;
  speechRuntime.sttInit = null;
  speechRuntime.ttsInit = null;
  speechRuntime.stsInit = null;
}
