/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 */

import type { WasmPaths } from "../tts/wasm-cache.js";
import type { AudioPlayerConfig } from "../tts/audio-player.js";
import type { VADControllerOptions } from "../stt/vad-controller.js";

export type LogLevel = "info" | "error" | "warning";

export type SpeechLogHandler = (message: string, level?: LogLevel) => void;

export interface SpeechToTextInitConfig {
  /**
   * `useSpeechToText` only (not speech-to-speech).
   *
   * When `true` (default), Web Speech keeps listening across silent browser restarts;
   * call `stopTranscript()` to emit `onFinalTranscript` once.
   *
   * When `false`, silence for `silenceThresholdMs` emits the final transcript and stops listening.
   */
  continueOnSilence?: boolean;
  /** Used when `continueOnSilence` is `false`. Default: 1500ms. `useSpeechToText` only. */
  silenceThresholdMs?: number;
  /** BCP-47 language tag for Web Speech (default: `en-US`). */
  language?: string;
  preserveTranscriptOnStart?: boolean;
}

/** Mic neural VAD tuning for speech-to-speech (always enabled in STS). */
export type SpeechToSpeechVadConfig = VADControllerOptions;

/**
 * STS STT settings. Final transcripts are emitted on VAD speech end (not Web Speech silence).
 * Web Speech always runs with `continueOnSilence: true` internally. Use `useSpeechToText` to
 * control `continueOnSilence` / `silenceThresholdMs` for standalone STT.
 */
export interface SpeechToSpeechSttConfig {
  language?: string;
  preserveTranscriptOnStart?: boolean;
  vad?: SpeechToSpeechVadConfig;
  heuristics?: SpeechToSpeechHeuristics;
}

export interface SpeechToTextHandlers {
  onLog?: SpeechLogHandler;
  onInterimTranscript?: (transcript: string) => void;
  /** Fires once per utterance/session per mode rules (see `continueOnSilence`). */
  onFinalTranscript?: (transcript: string) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onWordsUpdate?: (words: string[]) => void;
}

export interface SpeechToTextControls {
  startTranscript: () => void;
  stopTranscript: () => string;
  clearTranscription: () => void;
  destroyTranscription: () => void;
  getTranscript: () => string;
  isListening: () => boolean;
}

export interface TextToSpeechInitConfig {
  voiceId: string;
  wasmPaths?: WasmPaths;
  enableWasmCache?: boolean;
  autoPlay?: boolean;
  sampleRate?: number;
  volume?: number;
}

export interface TextToSpeechControls {
  speak: (text: string) => Promise<void>;
  /** Enqueue multiple sentences (split on `.!?;`) for lower latency. */
  speakSentences: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  isReady: () => boolean;
}

export type SpeechConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export interface SpeechToSpeechHeuristics {
  /** LLM endpoint used only for short/long filler generation (not the main agent). */
  llmEndpoint: string;
  apiKey: string;
  secretKey?: string;
  /**
   * After ~5s of speech (from first partial), LLM generates a brief acknowledgment.
   * Emitted via `onFillerGenerated` and synthesized into the shared audio queue.
   */
  shortFillerWords?: boolean;
  /**
   * After ~10s of speech, LLM generates a short rephrase of the partial transcript.
   */
  longFillerWords?: boolean;
  /** Ms from speech start before short filler (default `5000`). */
  shortFillerDelayMs?: number;
  /** Ms from speech start before long filler (default `10000`). */
  longFillerDelayMs?: number;
  /** LLM timeout for filler requests (default `15000`). */
  fillerRequestTimeoutMs?: number;
  shortFillerSystemPrompt?: string;
  longFillerSystemPrompt?: string;
  /** Optional model id (default: `deepseek-chat`). */
  model?: string;
  languageHint?: string;
  /** Max user+assistant turns kept for filler context (default `10`). */
  maxHistoryTurns?: number;
}

export type SpeechToSpeechAgentState =
  | "idle"
  | "listening"
  | "speaking";

export interface SpeechToSpeechInitConfig {
  stt: SpeechToSpeechSttConfig;
  tts: TextToSpeechInitConfig;
  /** When true (default), user speech while audio is playing stops playback. */
  bargeIn?: boolean;
}

export interface SpeechToSpeechHandlers {
  onLog?: SpeechLogHandler;
  onInterimTranscript?: (transcript: string) => void;
  /** Fires as soon as the final transcript is available (independent of filler generation). */
  onFinalTranscript?: (transcript: string) => void;
  onFillerGenerated?: (type: "short" | "long", text: string) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onAgentStateChange?: (state: SpeechToSpeechAgentState) => void;
  /**
   * Prefer consumer-owned chat history for filler LLM context.
   * When omitted, the SDK keeps the last `maxHistoryTurns` turns internally.
   */
  getConversationHistory?: () => SpeechConversationTurn[];
}

export interface SpeechToSpeechControls {
  startConversation: () => Promise<void>;
  stopConversation: () => void;
  clearTranscription: () => void;
  /** Replace SDK-managed history (ignored when `getConversationHistory` is provided). */
  setConversationHistory: (turns: SpeechConversationTurn[]) => void;
  /** Append a turn after the consumer processes an LLM reply (SDK-managed history only). */
  appendConversationTurn: (turn: SpeechConversationTurn) => void;
  destroy: () => void;
}

export type SharedAudioPlayerConfig = AudioPlayerConfig;

export interface SharedAudioPlayer {
  configure: (config: SharedAudioPlayerConfig) => void;
  enqueue: (audio: Float32Array, sampleRate?: number) => void;
  stop: () => void;
  clearQueue: () => void;
  stopAndClear: () => void;
  waitUntilIdle: () => Promise<void>;
  setVolume: (volume: number) => void;
  setStatusCallback: (cb: (status: string) => void) => void;
  setPlayingChangeCallback: (cb: (playing: boolean) => void) => void;
  getQueueSize: () => number;
  isPlaying: () => boolean;
}
