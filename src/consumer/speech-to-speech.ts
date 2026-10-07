/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 */

import { STTLogic } from "../stt/stt-logic.js";
import { VADController } from "../stt/vad-controller.js";
import { internalSpeechState } from "../internal/speech-state.js";
import { speechRuntime } from "./runtime.js";
import { initializeSpeechToText } from "./speech-to-text.js";
import { initializeTextToSpeech, useTextToSpeech } from "./text-to-speech.js";
import { useSharedAudioPlayer } from "./shared-audio-player.js";
import type {
  SpeechConversationTurn,
  SpeechToSpeechAgentState,
  SpeechToSpeechControls,
  SpeechToSpeechHandlers,
  SpeechToSpeechInitConfig,
} from "./types.js";

const DEFAULT_MAX_HISTORY_TURNS = 10;

function trimHistory(
  turns: SpeechConversationTurn[],
  maxTurns: number,
): SpeechConversationTurn[] {
  const maxMessages = maxTurns * 2;
  if (turns.length <= maxMessages) return turns;
  return turns.slice(turns.length - maxMessages);
}

/**
 * Preload TTS and store STT + heuristics config for conversational mode.
 * STS always uses neural VAD; final transcripts are emitted on VAD speech end.
 */
export async function initializeSpeechToSpeech(
  config: SpeechToSpeechInitConfig,
): Promise<void> {
  speechRuntime.stsInit = config;

  const { stt, tts } = config;
  const { heuristics: _heuristics, vad: vadOptions, ...sttBase } = stt;

  initializeSpeechToText({
    language: sttBase.language,
    preserveTranscriptOnStart: sttBase.preserveTranscriptOnStart,
  });
  await initializeTextToSpeech(tts);

  speechRuntime.vad?.destroy();
  speechRuntime.vad = new VADController(vadOptions);
  await speechRuntime.vad.prepare();
}

export function useSpeechToSpeech(
  handlers: SpeechToSpeechHandlers = {},
): SpeechToSpeechControls {
  const stsConfig = speechRuntime.stsInit;
  if (!stsConfig) {
    throw new Error(
      "Speech-to-speech is not configured. Call initializeSpeechToSpeech() first.",
    );
  }

  const player = useSharedAudioPlayer();
  const tts = useTextToSpeech({ player });
  const heuristics = stsConfig.stt.heuristics;
  const bargeIn = stsConfig.bargeIn !== false;
  const maxHistoryTurns =
    heuristics?.maxHistoryTurns ?? DEFAULT_MAX_HISTORY_TURNS;

  let agentState: SpeechToSpeechAgentState = "idle";
  let suppressFinalTranscript = false;
  let conversationActive = false;
  const sdkHistory: SpeechConversationTurn[] = [];

  let micVad: VADController | null = speechRuntime.vad;
  const vadUnsubs: Array<() => void> = [];

  const setAgentState = (state: SpeechToSpeechAgentState) => {
    agentState = state;
    handlers.onAgentStateChange?.(state);
  };

  const log = (message: string, level?: "info" | "error" | "warning") =>
    handlers.onLog?.(message, level);

  const getConversationHistory = (): SpeechConversationTurn[] => {
    const external = handlers.getConversationHistory?.();
    if (external) {
      return trimHistory(external, maxHistoryTurns);
    }
    return [...sdkHistory];
  };

  const appendSdkTurn = (turn: SpeechConversationTurn) => {
    if (handlers.getConversationHistory) return;
    sdkHistory.push(turn);
    const trimmed = trimHistory(sdkHistory, maxHistoryTurns);
    sdkHistory.length = 0;
    sdkHistory.push(...trimmed);
  };

  if (speechRuntime.stt) {
    speechRuntime.stt.destroy();
  }

  const emitFinalTranscript = (transcript: string) => {
    const trimmed = transcript.trim();
    if (!trimmed) return;

    stt.cancelPendingFillers();
    handlers.onFinalTranscript?.(trimmed);
    appendSdkTurn({ role: "user", content: trimmed });
    speechRuntime.stt?.clearTranscript();
  };

  const fillersEnabled =
    heuristics?.shortFillerWords === true ||
    heuristics?.longFillerWords === true;

  const stt = new STTLogic(
    (message, level) => log(message, level),
    (transcript) => {
      if (suppressFinalTranscript) return;
      emitFinalTranscript(transcript);
    },
    {
      continueOnSilence: true,
      language: stsConfig.stt.language,
      preserveTranscriptOnStart: stsConfig.stt.preserveTranscriptOnStart,
      onInterimTranscript: handlers.onInterimTranscript,
      enableShortFiller: heuristics?.shortFillerWords ?? false,
      enableLongFiller: heuristics?.longFillerWords ?? false,
      shortFillerDelayMs: heuristics?.shortFillerDelayMs,
      longFillerDelayMs: heuristics?.longFillerDelayMs,
      llmApiUrl: heuristics?.llmEndpoint,
      llmApiKey: heuristics?.apiKey,
      llmModel: heuristics?.model,
      llmTimeoutMs: heuristics?.fillerRequestTimeoutMs,
      languageHint: heuristics?.languageHint,
      shortFillerPrompt: heuristics?.shortFillerSystemPrompt,
      longFillerPrompt: heuristics?.longFillerSystemPrompt,
      llmSecretKey: heuristics?.secretKey,
      getConversationHistory,
      maxHistoryTurns,
      utteranceTimerMode: "explicit",
      manageInternalSpeechState: false,
      onFillerGenerated: (type, text) => {
        handlers.onFillerGenerated?.(type, text);
      },
      synthesize:
        fillersEnabled && speechRuntime.tts
          ? async (text) => {
              const result = await speechRuntime.tts!.synthesize(text);
              return { audio: result.audio, sampleRate: result.sampleRate };
            }
          : undefined,
    },
  );

  speechRuntime.stt = stt;

  player.setPlayingChangeCallback((playing) => {
    if (!conversationActive) return;
    if (playing) {
      setAgentState("speaking");
    } else if (agentState === "speaking") {
      setAgentState("listening");
    }
  });

  const shouldAcceptVadSpeechStart = (): boolean => {
    if (!conversationActive) return false;
    if (player.isPlaying() && !bargeIn) return false;
    return true;
  };

  const onMicVadVoiceStart = () => {
    if (!shouldAcceptVadSpeechStart()) return;

    if (bargeIn && player.isPlaying()) {
      player.stopAndClear();
      tts.stopSpeaking();
    }

    internalSpeechState.setSpeaking(true);
    handlers.onSpeakingChange?.(true);
    setAgentState("listening");

    if (!stt.isListeningActive()) {
      log("[VAD] Valid speech — starting Web Speech", "info");
      stt.start();
    }
  };

  const onMicVadVoiceStop = () => {
    internalSpeechState.setSpeaking(false);
    handlers.onSpeakingChange?.(false);
    if (!conversationActive || !stt.isListeningActive()) return;

    log("[VAD] Speech ended — stopping Web Speech", "info");
    suppressFinalTranscript = false;
    stt.stop();
  };

  try {
    if (!micVad) {
      micVad = new VADController(stsConfig.stt.vad);
      speechRuntime.vad = micVad;
    }
    vadUnsubs.push(
      micVad.onVoiceStart(onMicVadVoiceStart),
      micVad.onVoiceStop(onMicVadVoiceStop),
      micVad.onVoiceMisfire(() => {
        log("[VAD] Misfire (utterance too short) — resetting STT", "warning");
        stt.cancelPendingFillers();
        if (stt.isListeningActive()) {
          suppressFinalTranscript = true;
          stt.stop();
          suppressFinalTranscript = false;
          stt.clearTranscript();
        }
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "VAD init failed";
    log(message, "error");
    micVad = null;
  }

  const teardownVad = () => {
    vadUnsubs.forEach((u) => u());
    vadUnsubs.length = 0;
    micVad?.destroy();
    micVad = null;
  };

  return {
    startConversation: async () => {
      if (!micVad) {
        throw new Error(
          "Speech-to-speech VAD is not available. Call initializeSpeechToSpeech() first.",
        );
      }
      if (!stt.isListeningActive()) {
        log("[VAD] Valid speech — starting Web Speech", "info");
        stt.start();
      }
      conversationActive = true;
      setAgentState("listening");
      try {
        log("[VAD] Requesting microphone…", "info");
        await micVad.start();
        log(
          "[VAD] Mic active — speak clearly; Web Speech opens after validated speech",
          "info",
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "VAD start failed";
        log(message, "error");
        conversationActive = false;
        setAgentState("idle");
        throw error;
      }
    },
    stopConversation: () => {
      conversationActive = false;
      stt.cancelPendingFillers();
      suppressFinalTranscript = true;
      if (stt.isListeningActive()) {
        stt.stop();
      }
      suppressFinalTranscript = false;
      micVad?.stop();
      tts.stopSpeaking();
      setAgentState("idle");
    },
    clearTranscription: () => stt.clearTranscript(),
    setConversationHistory: (turns) => {
      if (handlers.getConversationHistory) return;
      sdkHistory.length = 0;
      sdkHistory.push(...trimHistory(turns, maxHistoryTurns));
      stt.getFillerManager()?.configure({ getConversationHistory });
    },
    appendConversationTurn: (turn) => {
      appendSdkTurn(turn);
      stt.getFillerManager()?.configure({ getConversationHistory });
    },
    destroy: () => {
      conversationActive = false;
      stt.cancelPendingFillers();
      suppressFinalTranscript = true;
      if (stt.isListeningActive()) {
        stt.stop();
      }
      suppressFinalTranscript = false;
      teardownVad();
      stt.destroy();
      speechRuntime.stt = null;
      player.stopAndClear();
      setAgentState("idle");
    },
  };
}
