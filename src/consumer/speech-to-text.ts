/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 */

import { STTLogic } from "../stt/stt-logic.js";
import { speechRuntime } from "./runtime.js";
import type {
  SpeechToTextControls,
  SpeechToTextHandlers,
  SpeechToTextInitConfig,
} from "./types.js";

const defaultSttInit: SpeechToTextInitConfig = {
  continueOnSilence: true,
  silenceThresholdMs: 1500,
  language: "en-US",
};

/**
 * Store STT configuration. Call before `useSpeechToText` (or before starting STS).
 * Lightweight — no microphone access until `startTranscript()`.
 */
export function initializeSpeechToText(
  config: SpeechToTextInitConfig = {},
): void {
  speechRuntime.sttInit = { ...defaultSttInit, ...config };
}

function buildSttInstance(handlers: SpeechToTextHandlers): STTLogic {
  const init = { ...defaultSttInit, ...speechRuntime.sttInit };

  const stt = new STTLogic(
    (message, level) => handlers.onLog?.(message, level),
    (transcript) => handlers.onFinalTranscript?.(transcript),
    {
      continueOnSilence: init.continueOnSilence,
      silenceThresholdMs: init.silenceThresholdMs,
      preserveTranscriptOnStart: init.preserveTranscriptOnStart,
      language: init.language,
      onInterimTranscript: handlers.onInterimTranscript,
      enableShortFiller: false,
      enableLongFiller: false,
    },
  );

  if (handlers.onWordsUpdate) {
    stt.setWordsUpdateCallback(handlers.onWordsUpdate);
  }

  if (handlers.onSpeakingChange) {
    stt.setVadCallbacks(
      () => handlers.onSpeakingChange?.(true),
      () => handlers.onSpeakingChange?.(false),
    );
  }

  return stt;
}

/**
 * Wire callbacks and receive imperative STT controls.
 * Re-calling updates handlers on a fresh instance if already active.
 */
export function useSpeechToText(
  handlers: SpeechToTextHandlers = {},
): SpeechToTextControls {
  if (!speechRuntime.sttInit) {
    speechRuntime.sttInit = { ...defaultSttInit };
  }

  if (speechRuntime.stt) {
    speechRuntime.stt.destroy();
  }

  speechRuntime.stt = buildSttInstance(handlers);
  const stt = speechRuntime.stt;

  return {
    startTranscript: () => stt.start(),
    stopTranscript: () => {
      stt.stop();
      return stt.getFullTranscript();
    },
    clearTranscription: () => stt.clearTranscript(),
    destroyTranscription: () => {
      stt.destroy();
      speechRuntime.stt = null;
    },
    getTranscript: () => stt.getFullTranscript(),
    isListening: () => stt.isListeningActive(),
  };
}
