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

export { AudioPlayer, createAudioPlayer } from "./audio-player";
export type { AudioPlayerConfig } from "./audio-player";
