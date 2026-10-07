/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 */

export {
  initializeSpeechToText,
  useSpeechToText,
} from "./speech-to-text.js";

export {
  initializeTextToSpeech,
  prefetchTextToSpeechAssets,
  useTextToSpeech,
} from "./text-to-speech.js";

export {
  initializeSpeechToSpeech,
  useSpeechToSpeech,
} from "./speech-to-speech.js";

export {
  createSharedAudioPlayer,
  useSharedAudioPlayer,
} from "./shared-audio-player.js";

export type {
  LogLevel,
  SpeechLogHandler,
  SpeechToTextInitConfig,
  SpeechToTextHandlers,
  SpeechToTextControls,
  TextToSpeechInitConfig,
  TextToSpeechControls,
  SpeechToSpeechInitConfig,
  SpeechToSpeechSttConfig,
  SpeechToSpeechVadConfig,
  SpeechToSpeechHandlers,
  SpeechToSpeechControls,
  SpeechToSpeechHeuristics,
  SpeechToSpeechAgentState,
  SharedAudioPlayer,
  SharedAudioPlayerConfig,
} from "./types.js";

export { getCompatibilityInfo } from "../stt/stt-logic.js";
export type { CompatibilityInfo } from "../stt/stt-logic.js";
