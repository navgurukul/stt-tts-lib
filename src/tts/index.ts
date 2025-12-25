export { preparePiperVoice } from "./prepare-piper-voice.js";
export type { PiperVoiceConfig, PreparedPiperVoice } from "./prepare-piper-voice.js";

export { streamTokensToSpeech } from "./stream-tokens-to-speech.js";
export type { StreamTokensOptions, StreamTokensResult } from "./stream-tokens-to-speech.js";

export { createOrtEnvironment } from "./ort-setup.js";
export type { OrtDevice, OrtEnvironment, OrtEnvironmentConfig, OrtLogLevel } from "./ort-setup.js";

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
} from "./piper.js";
export type { SynthResult, Synthesizer, Player } from "./piper.js";

export { useStreamingTTS } from "./use-streaming-tts.js";
export type { StreamingTTSController, StreamingTTSOptions } from "./use-streaming-tts.js";

export { PiperSynthesizer, createPiperSynthesizer, textToPhonemes } from "./piper-synthesizer.js";
export type { PiperSynthesizerConfig, SynthesisResult } from "./piper-synthesizer.js";

export { AudioPlayer, createAudioPlayer } from "./audio-player.js";
export type { AudioPlayerConfig } from "./audio-player.js";
