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

export { preparePiperVoice } from "./prepare-piper-voice";
export type {
  PiperVoiceConfig,
  PreparedPiperVoice,
} from "./prepare-piper-voice.js";

export { streamTokensToSpeech } from "./stream-tokens-to-speech";
export type {
  StreamTokensOptions,
  StreamTokensResult,
} from "./stream-tokens-to-speech";

export { createOrtEnvironment } from "./ort-setup";
export type {
  OrtDevice,
  OrtEnvironment,
  OrtEnvironmentConfig,
  OrtLogLevel,
} from "./ort-setup.js";

export {
  ensureOrtReady,
  ensureVoiceLoaded,
  warmupPiper,
  resetVoiceCache,
  getBackendLabel,
  isCorruptModelError,
  synthesizerWorker,
  playerWorker,
  handleChunk,
  emitSentence,
  nextBoundaryIndex,
  getAsyncIterator,
  SimpleQueue,
} from "./piper";
export type { SynthResult, Synthesizer, Player } from "./piper";

export { useStreamingTTS } from "./use-streaming-tts";
export type {
  StreamingTTSController,
  StreamingTTSOptions,
} from "./use-streaming-tts";

export { TTSLogic, textToPhonemes } from "./piper-synthesizer";
export type {
  PiperSynthesizerConfig,
  SynthesisResult,
} from "./piper-synthesizer";

export {
  AudioPlayer,
  createAudioPlayer,
  sharedAudioPlayer,
} from "./audio-player";
export type {
  AudioPlayerConfig,
  QueuedAudio,
  AudioPlayerStatusCallback,
  PlayingStateCallback,
} from "./audio-player";

export {
  FillerManager,
  getFillerManager,
  configureFillerManager,
} from "./filler-manager";
export type { FillerConfig } from "./filler-manager";
