/**
 * Sample demonstrating the consumer hook APIs from speech-to-speech.
 */

import {
  initializeSpeechToText,
  useSpeechToText,
  initializeTextToSpeech,
  useTextToSpeech,
  initializeSpeechToSpeech,
  useSpeechToSpeech,
  useSharedAudioPlayer,
  prefetchTextToSpeechAssets,
} from "speech-to-speech";
import type { WasmPaths } from "speech-to-speech/tts";

declare global {
  interface Window {
    clearLog: () => void;
    startSTT: () => Promise<void>;
    stopSTT: () => void;
    initTTS: () => Promise<void>;
    synthesizeText: () => Promise<void>;
    stopAudio: () => void;
    prefetchWasmCache: () => Promise<void>;
    initSTS: () => Promise<void>;
    startSTS: () => void;
    stopSTS: () => void;
    teardownDemoTab: (tabName: string) => void;
    syncStsOptionFields: () => void;
  }
}

type DemoTab = "stt" | "tts" | "sts" | "info";
let currentDemoTab: DemoTab = "stt";

let sttControls: ReturnType<typeof useSpeechToText> | null = null;
let ttsControls: ReturnType<typeof useTextToSpeech> | null = null;
let stsControls: ReturnType<typeof useSpeechToSpeech> | null = null;
let stsTts: ReturnType<typeof useTextToSpeech> | null = null;
const player = useSharedAudioPlayer();

type ChatTurn = { role: "user" | "assistant"; content: string };
const stsChatHistory: ChatTurn[] = [];

function addLog(message: string, type = "info") {
  const logDiv = document.getElementById("log");
  if (!logDiv) return;
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  logDiv.appendChild(entry);
  logDiv.scrollTop = logDiv.scrollHeight;
  console.log(`[${type}] ${message}`);
}

function clearLog() {
  const logDiv = document.getElementById("log");
  if (logDiv) logDiv.innerHTML = "";
}

function getWasmBaseUrlFromUi(): string | undefined {
  const input = document.getElementById(
    "wasmBaseUrl",
  ) as HTMLInputElement | null;
  const baseUrl = input?.value?.trim() ?? "";
  return baseUrl.length > 0 ? baseUrl : undefined;
}

function getWasmConfigFromUi(): {
  wasmPaths?: WasmPaths;
  enableWasmCache?: boolean;
} {
  const enableCacheEl = document.getElementById(
    "enableWasmCache",
  ) as HTMLInputElement | null;
  const enableWasmCache = enableCacheEl?.checked ?? true;

  const baseUrl = getWasmBaseUrlFromUi();
  const onnxInput = document.getElementById(
    "onnxWasmUrl",
  ) as HTMLInputElement | null;
  const onnxWasm = onnxInput?.value?.trim() ?? "";

  if (!baseUrl) {
    return { enableWasmCache };
  }

  const wasmPaths: WasmPaths = {
    piperData: `${baseUrl}.data`,
    piperWasm: `${baseUrl}.wasm`,
  };
  if (onnxWasm) {
    wasmPaths.onnxWasm = onnxWasm;
  }

  return { enableWasmCache, wasmPaths };
}

window.clearLog = clearLog;
window.prefetchWasmCache = async function () {
  try {
    const { enableWasmCache, wasmPaths } = getWasmConfigFromUi();
    if (enableWasmCache === false) {
      addLog("WASM cache is disabled. Enable it to prefetch.", "info");
      return;
    }
    addLog("Prefetching TTS WASM assets...", "info");
    await prefetchTextToSpeechAssets({ wasmPaths });
    addLog("✓ WASM assets cached", "success");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`✗ Prefetch failed: ${message}`, "error");
  }
};

window.startSTT = async function () {
  try {
    addLog("Starting Speech-to-Text...", "info");

    initializeSpeechToText({
      continueOnSilence: true,
      silenceThresholdMs: 5000,
      preserveTranscriptOnStart: false,
    });

    sttControls = useSpeechToText({
      onLog: (msg, level) => addLog(`[STT] ${msg}`, level || "info"),
      onInterimTranscript: (text) => {
        const el = document.getElementById(
          "transcript",
        ) as HTMLTextAreaElement | null;
        if (el) el.value = text;
      },
      onFinalTranscript: (text) => {
        const el = document.getElementById(
          "transcript",
        ) as HTMLTextAreaElement | null;
        if (el) el.value = text;
      },
      onWordsUpdate: (heardWords) => {
        const wordsDiv = document.getElementById("heardWords");
        if (!wordsDiv) return;
        if (heardWords.length > 0) {
          wordsDiv.innerHTML = heardWords
            .map(
              (w) =>
                `<span style="padding: 4px 8px; margin: 2px; background: #e3f2fd; border-radius: 4px; display: inline-block;">${w}</span>`,
            )
            .join(" ");
        } else {
          wordsDiv.innerHTML = "<em>No words yet</em>";
        }
      },
    });

    sttControls.startTranscript();

    (document.getElementById("startSttBtn") as HTMLButtonElement).disabled =
      true;
    (document.getElementById("stopSttBtn") as HTMLButtonElement).disabled =
      false;
    addLog("✓ Listening started", "success");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`✗ Failed to start STT: ${message}`, "error");
  }
};

window.stopSTT = function () {
  if (sttControls) {
    sttControls.stopTranscript();
    (document.getElementById("startSttBtn") as HTMLButtonElement).disabled =
      false;
    (document.getElementById("stopSttBtn") as HTMLButtonElement).disabled =
      true;
    addLog("✓ Listening stopped", "info");
  }
};

function parsePositiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function getStsOptionsFromUi() {
  const shortFillerWords =
    (document.getElementById("stsShortFiller") as HTMLInputElement)?.checked ??
    false;
  const longFillerWords =
    (document.getElementById("stsLongFiller") as HTMLInputElement)?.checked ??
    false;
  const shortFillerDelayMs = parsePositiveInt(
    (document.getElementById("stsShortFillerDelayMs") as HTMLInputElement)
      ?.value ?? "5000",
    5000,
  );
  const longFillerDelayMs = parsePositiveInt(
    (document.getElementById("stsLongFillerDelayMs") as HTMLInputElement)
      ?.value ?? "10000",
    10000,
  );
  const fillerRequestTimeoutMs = parsePositiveInt(
    (document.getElementById("stsFillerTimeoutMs") as HTMLInputElement)?.value ??
      "15000",
    15000,
  );
  const languageHint =
    (
      document.getElementById("stsLanguageHint") as HTMLInputElement
    )?.value?.trim() || "English";

  return {
    shortFillerWords,
    longFillerWords,
    shortFillerDelayMs,
    longFillerDelayMs,
    fillerRequestTimeoutMs,
    languageHint,
  };
}

function setStsConfigFieldsDisabled(disabled: boolean) {
  document.querySelectorAll(".sts-config-field").forEach((el) => {
    (el as HTMLInputElement).disabled = disabled;
  });
  if (!disabled) {
    window.syncStsOptionFields();
  }
}

function updateStsStatus(
  message: string,
  type: "info" | "success" | "error" = "info",
) {
  const statusEl = document.getElementById("stsStatus");
  if (statusEl) {
    const colors = { info: "#666", success: "#388e3c", error: "#d32f2f" };
    statusEl.innerHTML = `<span style="color: ${colors[type]};">Status: ${message}</span>`;
  }
}

async function handleStsUserTurn(
  userText: string,
  apiUrl: string,
  apiKey: string,
  model: string,
) {
  if (!stsTts?.isReady()) {
    addLog("✗ TTS not ready for agent reply", "error");
    return;
  }

  stsChatHistory.push({ role: "user", content: userText });

  try {
    addLog("🤔 Calling LLM (consumer)...", "info");
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful voice assistant. Keep responses concise (2-3 sentences).",
          },
          ...stsChatHistory,
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM failed (${response.status})`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply =
      data.choices?.[0]?.message?.content?.trim() ||
      "Sorry, I could not process that.";

    const el = document.getElementById(
      "stsAiResponse",
    ) as HTMLTextAreaElement;
    if (el) el.value = reply;

    stsChatHistory.push({ role: "assistant", content: reply });
    if (stsChatHistory.length > 20) {
      stsChatHistory.splice(0, stsChatHistory.length - 20);
    }

    addLog(`🤖 Agent: "${reply}"`, "success");
    await stsTts.speakSentences(reply);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`✗ Agent turn failed: ${message}`, "error");
  }
}

window.initSTS = async function () {
  try {
    const voiceId = (document.getElementById("stsVoiceId") as HTMLInputElement)
      .value;
    const apiUrl = (document.getElementById("stsApiUrl") as HTMLInputElement)
      .value;
    const apiKey = (document.getElementById("stsApiKey") as HTMLInputElement)
      .value;
    const model = (document.getElementById("stsModel") as HTMLInputElement)
      .value;

    updateStsStatus("Initializing...", "info");
    addLog("🚀 Initializing Speech-to-Speech...", "info");

    const wasmConfig = getWasmConfigFromUi();
    const stsOptions = getStsOptionsFromUi();

    addLog("Loading VAD model (ORT + Silero)…", "info");

    addLog(
      `Filler config: short=${stsOptions.shortFillerWords} (${stsOptions.shortFillerDelayMs}ms), long=${stsOptions.longFillerWords} (${stsOptions.longFillerDelayMs}ms)`,
      "info",
    );

    await initializeSpeechToSpeech({
      stt: {
        preserveTranscriptOnStart: false,
        heuristics: {
          llmEndpoint: apiUrl,
          apiKey,
          model,
          shortFillerWords: stsOptions.shortFillerWords,
          longFillerWords: stsOptions.longFillerWords,
          shortFillerDelayMs: stsOptions.shortFillerDelayMs,
          longFillerDelayMs: stsOptions.longFillerDelayMs,
          fillerRequestTimeoutMs: stsOptions.fillerRequestTimeoutMs,
          languageHint: stsOptions.languageHint,
        },
      },
      tts: {
        voiceId,
        ...wasmConfig,
        autoPlay: true,
      },
      bargeIn: true,
    });

    player.setStatusCallback((status) => addLog(`[Audio] ${status}`, "info"));
    stsTts = useTextToSpeech({ player });

    stsControls = useSpeechToSpeech({
      onLog: (msg, level) => addLog(`[STT] ${msg}`, level || "info"),
      getConversationHistory: () => stsChatHistory,
      onInterimTranscript: (text) => {
        const el = document.getElementById(
          "stsUserTranscript",
        ) as HTMLTextAreaElement;
        if (el) el.value = text;
      },
      onFillerGenerated: (type, text) => {
        addLog(`💬 Filler (${type}): "${text}"`, "info");
      },
      onFinalTranscript: (text) => {
        addLog(`🎤 Final: "${text}"`, "info");
        void handleStsUserTurn(text, apiUrl, apiKey, model);
      },
      onAgentStateChange: (state) => {
        const labels: Record<string, string> = {
          idle: "Idle",
          listening: "🎤 Listening...",
          speaking: "🔊 Speaking...",
        };
        updateStsStatus(labels[state] ?? state, "success");
      },
      onSpeakingChange: (speaking) => {
        if (speaking) updateStsStatus("🎤 Listening...", "success");
      },
    });

    (document.getElementById("startStsBtn") as HTMLButtonElement).disabled =
      false;
    (document.getElementById("initStsBtn") as HTMLButtonElement).disabled =
      true;
    setStsConfigFieldsDisabled(true);

    updateStsStatus("Ready! Click Start to begin.", "success");
    addLog("✅ Speech-to-Speech ready (VAD loaded)", "success");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`✗ STS init failed: ${message}`, "error");
    updateStsStatus(`Init failed: ${message}`, "error");
  }
};

window.startSTS = async function () {
  if (!stsControls) {
    addLog("✗ Please initialize STS first", "error");
    return;
  }

  (document.getElementById("stsUserTranscript") as HTMLTextAreaElement).value =
    "";
  (document.getElementById("stsAiResponse") as HTMLTextAreaElement).value = "";
  stsChatHistory.length = 0;

  try {
    await stsControls.startConversation();
    (document.getElementById("startStsBtn") as HTMLButtonElement).disabled =
      true;
    (document.getElementById("stopStsBtn") as HTMLButtonElement).disabled =
      false;
    addLog("🎤 Conversation started — microphone active", "success");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`✗ Could not start conversation: ${message}`, "error");
  }
};

window.stopSTS = function () {
  stsControls?.stopConversation();
  (document.getElementById("startStsBtn") as HTMLButtonElement).disabled =
    false;
  (document.getElementById("stopStsBtn") as HTMLButtonElement).disabled = true;
  updateStsStatus("Stopped", "info");
  addLog("⏹️ Conversation stopped", "info");
};

window.initTTS = async function () {
  try {
    const voiceInput = (
      document.getElementById("modelPath") as HTMLInputElement
    ).value;

    addLog(`Initializing TTS (voice: ${voiceInput})...`, "info");

    const wasmConfig = getWasmConfigFromUi();
    await initializeTextToSpeech({
      voiceId: voiceInput,
      ...wasmConfig,
      autoPlay: true,
    });

    player.setStatusCallback((status) => addLog(status, "info"));
    player.setPlayingChangeCallback((playing) => {
      addLog(`Playing: ${playing}`, playing ? "success" : "info");
    });

    ttsControls = useTextToSpeech({ player });
    addLog("✓ TTS ready", "success");
    (document.getElementById("synthesizeBtn") as HTMLButtonElement).disabled =
      false;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`✗ TTS init failed: ${message}`, "error");
  }
};

window.synthesizeText = async function () {
  if (!ttsControls?.isReady()) {
    addLog("✗ Initialize TTS first", "error");
    return;
  }

  try {
    const text = (document.getElementById("ttsText") as HTMLTextAreaElement)
      .value;
    if (!text.trim()) {
      addLog("✗ Enter text to synthesize", "error");
      return;
    }

    const start = performance.now();
    await ttsControls.speakSentences(text);
    await player.waitUntilIdle();
    addLog(
      `✅ Playback complete (${(performance.now() - start).toFixed(0)}ms)`,
      "success",
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`✗ Synthesis failed: ${message}`, "error");
  }
};

window.stopAudio = function () {
  player.stopAndClear();
  ttsControls?.stopSpeaking();
  addLog("Audio stopped", "info");
};

function teardownDemoTab(tabName: string) {
  switch (tabName) {
    case "stt":
      window.stopSTT();
      break;
    case "tts":
      ttsControls?.stopSpeaking();
      player.stopAndClear();
      addLog("Tab switch: stopped TTS synthesis and audio", "info");
      break;
    case "sts":
      window.stopSTS();
      break;
    default:
      break;
  }
}

window.teardownDemoTab = function (tabName: string) {
  if (tabName === currentDemoTab) return;
  teardownDemoTab(currentDemoTab);
  currentDemoTab = tabName as DemoTab;
};

window.syncStsOptionFields = function () {
  const shortOn =
    (document.getElementById("stsShortFiller") as HTMLInputElement)?.checked ??
    false;
  const longOn =
    (document.getElementById("stsLongFiller") as HTMLInputElement)?.checked ??
    false;
  const fillersOn = shortOn || longOn;
  document.querySelectorAll(".sts-filler-field").forEach((el) => {
    (el as HTMLInputElement).disabled = !fillersOn;
  });
};

window.addEventListener("DOMContentLoaded", () => {
  window.syncStsOptionFields();
  addLog("Consumer sample loaded (hook APIs)", "success");
});

window.addEventListener("beforeunload", () => {
  sttControls?.destroyTranscription();
  stsControls?.destroy();
});
