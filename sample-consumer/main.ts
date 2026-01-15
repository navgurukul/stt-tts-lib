/**
 * Sample demonstrating how to consume stt-tts-lib package
 * This imports the library from the installed .tgz package
 *
 * Note: No separate ort-setup.js needed - ORT is configured automatically
 * by the library when you call createPiperSynthesizer()
 */

// Import from the installed speech-to-speech package
import {
  STTLogic,
  TTSLogic,
  AudioPlayer,
  createAudioPlayer,
  sharedAudioPlayer,
} from "speech-to-speech";

// Extend Window interface for global functions
declare global {
  interface Window {
    clearLog: () => void;
    startSTT: () => Promise<void>;
    stopSTT: () => void;
    initTTS: () => Promise<void>;
    synthesizeText: () => Promise<void>;
    stopAudio: () => void;
    // STS functions
    initSTS: () => Promise<void>;
    startSTS: () => void;
    stopSTS: () => void;
  }
}

// Global state
let sttLogic: STTLogic | null = null;
let piperSynthesizer: TTSLogic | null = null;
let audioPlayer: AudioPlayer | null = null;

// STS state
let stsSTT: STTLogic | null = null;
let stsTTS: TTSLogic | null = null;
let stsConversationHistory: { role: "user" | "assistant"; content: string }[] =
  [];
let stsProcessing = false;

// Utility: Add log entry
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

// Expose to window for HTML onclick handlers
window.clearLog = clearLog;

//=============================================================================
// STT Functions
//=============================================================================

window.startSTT = async function () {
  try {
    addLog("Starting Speech-to-Text...", "info");

    // Initialize STT Logic if not already done
    if (!sttLogic) {
      addLog("Initializing STTLogic from stt-tts-lib...", "info");

      sttLogic = new STTLogic(
        // onLog callback
        (msg: string, level?: string) =>
          addLog(`[STT] ${msg}`, level || "info"),
        // onTranscript callback
        (transcript: string) => {
          const el = document.getElementById(
            "transcript"
          ) as HTMLTextAreaElement | null;
          if (el) el.value = transcript;
        },
        // options
        {
          sessionDurationMs: 30000, // 30 seconds per session
          interimSaveIntervalMs: 5000,
          preserveTranscriptOnStart: false,
        }
      );

      // Hook word updates to display heard words
      sttLogic.setWordsUpdateCallback((heardWords: string[]) => {
        const wordsDiv = document.getElementById("heardWords");
        if (!wordsDiv) return;
        if (heardWords.length > 0) {
          wordsDiv.innerHTML = heardWords
            .map(
              (w) =>
                `<span style="padding: 4px 8px; margin: 2px; background: #e3f2fd; border-radius: 4px; display: inline-block;">${w}</span>`
            )
            .join(" ");
        } else {
          wordsDiv.innerHTML = "<em>No words yet</em>";
        }
      });

      addLog("✓ STTLogic initialized successfully", "success");
    }

    sttLogic.start();

    (document.getElementById("startSttBtn") as HTMLButtonElement).disabled =
      true;
    (document.getElementById("stopSttBtn") as HTMLButtonElement).disabled =
      false;

    addLog("✓ Listening started", "success");
  } catch (error: any) {
    addLog(`✗ Failed to start STT: ${error.message}`, "error");
    console.error(error);
  }
};

window.stopSTT = function () {
  if (sttLogic) {
    sttLogic.stop();
    (document.getElementById("startSttBtn") as HTMLButtonElement).disabled =
      false;
    (document.getElementById("stopSttBtn") as HTMLButtonElement).disabled =
      true;
    addLog("✓ Listening stopped", "info");
  }
};

//=============================================================================
// STS (Speech-to-Speech) Functions
//=============================================================================

function updateStsStatus(
  message: string,
  type: "info" | "success" | "error" = "info"
) {
  const statusEl = document.getElementById("stsStatus");
  if (statusEl) {
    const colors = { info: "#666", success: "#388e3c", error: "#d32f2f" };
    statusEl.innerHTML = `<span style="color: ${colors[type]};">Status: ${message}</span>`;
  }
}

/**
 * Send text to LLM and get response
 */
async function sendToLLM(userMessage: string): Promise<string> {
  const apiUrl = (document.getElementById("stsApiUrl") as HTMLInputElement)
    .value;
  const apiKey = (document.getElementById("stsApiKey") as HTMLInputElement)
    .value;
  const model = (document.getElementById("stsModel") as HTMLInputElement).value;

  if (!apiUrl || !apiKey) {
    throw new Error("Please configure LLM API URL and Key");
  }

  // Add user message to history
  stsConversationHistory.push({ role: "user", content: userMessage });

  const messages = [
    {
      role: "system" as const,
      content:
        "You are a helpful voice assistant. Keep responses concise and conversational (2-3 sentences max). Be friendly and natural.",
    },
    ...stsConversationHistory,
  ];

  addLog(`📤 Sending to LLM: "${userMessage.substring(0, 50)}..."`, "info");

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  const assistantMessage =
    data.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";

  // Add assistant response to history
  stsConversationHistory.push({ role: "assistant", content: assistantMessage });

  // Keep history manageable (last 10 exchanges)
  if (stsConversationHistory.length > 20) {
    stsConversationHistory = stsConversationHistory.slice(-20);
  }

  return assistantMessage;
}

/**
 * Process user speech: send to LLM and speak response
 */
async function processSpeechToSpeech(transcript: string): Promise<void> {
  if (stsProcessing || !transcript.trim()) return;

  stsProcessing = true;
  updateStsStatus("🤔 Thinking...", "info");

  try {
    // Get LLM response
    const aiResponse = await sendToLLM(transcript);
    addLog(`📥 LLM response: "${aiResponse.substring(0, 60)}..."`, "success");

    // Update UI
    const responseEl = document.getElementById(
      "stsAiResponse"
    ) as HTMLTextAreaElement;
    if (responseEl) responseEl.value = aiResponse;

    updateStsStatus("🔊 Speaking...", "info");

    // Synthesize and play response
    if (stsTTS) {
      const sentences = aiResponse
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.trim());

      for (const sentence of sentences) {
        const result = await stsTTS.synthesize(sentence);
        sharedAudioPlayer.addAudioIntoQueue(result.audio, result.sampleRate);
      }

      // Wait for playback to complete
      await sharedAudioPlayer.waitForQueueCompletion();
    }

    updateStsStatus("🎤 Listening...", "success");
  } catch (error: any) {
    addLog(`✗ STS error: ${error.message}`, "error");
    updateStsStatus(`Error: ${error.message}`, "error");
  } finally {
    stsProcessing = false;
  }
}

window.initSTS = async function () {
  try {
    const voiceId = (document.getElementById("stsVoiceId") as HTMLInputElement)
      .value;

    updateStsStatus("Initializing...", "info");
    addLog("🚀 Initializing Speech-to-Speech...", "info");

    // Configure shared audio player
    sharedAudioPlayer.configure({ autoPlay: true });
    sharedAudioPlayer.setStatusCallback((status) =>
      addLog(`[Audio] ${status}`, "info")
    );

    // Initialize TTS
    stsTTS = new TTSLogic({ voiceId });
    await stsTTS.initialize();
    addLog("✓ TTS initialized", "success");

    // Initialize STT with transcript callback
    stsSTT = new STTLogic(
      (msg, level) => addLog(`[STT] ${msg}`, level || "info"),
      (transcript) => {
        // Update transcript display on every update
        const transcriptEl = document.getElementById(
          "stsUserTranscript"
        ) as HTMLTextAreaElement;
        if (transcriptEl) transcriptEl.value = transcript;
      },
      {
        sessionDurationMs: 60000,
        interimSaveIntervalMs: 3000,
        preserveTranscriptOnStart: false,
      }
    );

    // Set callback for when user stops speaking
    stsSTT.setVadCallbacks(
      () => {
        // onSpeechStart
        updateStsStatus("🎤 Listening...", "success");
      },
      async () => {
        // onSpeechEnd - process the transcript
        const transcript = stsSTT?.getFullTranscript() || "";
        if (transcript.trim().length > 3 && !stsProcessing) {
          addLog(`🎤 Speech ended: "${transcript}"`, "info");
          await processSpeechToSpeech(transcript);
          // Clear transcript for next utterance after processing
          stsSTT?.clearTranscript();
        }
      }
    );

    addLog("✓ STT initialized", "success");

    // Enable buttons
    (document.getElementById("startStsBtn") as HTMLButtonElement).disabled =
      false;
    (document.getElementById("initStsBtn") as HTMLButtonElement).disabled =
      true;

    updateStsStatus("Ready! Click Start to begin.", "success");
    addLog("✅ Speech-to-Speech ready!", "success");
  } catch (error: any) {
    addLog(`✗ STS init failed: ${error.message}`, "error");
    updateStsStatus(`Init failed: ${error.message}`, "error");
  }
};

window.startSTS = function () {
  if (!stsSTT) {
    addLog("✗ Please initialize STS first", "error");
    return;
  }

  // Clear previous conversation display
  (document.getElementById("stsUserTranscript") as HTMLTextAreaElement).value =
    "";
  (document.getElementById("stsAiResponse") as HTMLTextAreaElement).value = "";

  stsSTT.start();

  (document.getElementById("startStsBtn") as HTMLButtonElement).disabled = true;
  (document.getElementById("stopStsBtn") as HTMLButtonElement).disabled = false;

  updateStsStatus("🎤 Listening... Speak now!", "success");
  addLog("🎤 Conversation started - speak now!", "success");
};

window.stopSTS = function () {
  if (stsSTT) {
    stsSTT.stop();
  }
  sharedAudioPlayer.stopAndClearQueue();
  stsProcessing = false;

  (document.getElementById("startStsBtn") as HTMLButtonElement).disabled =
    false;
  (document.getElementById("stopStsBtn") as HTMLButtonElement).disabled = true;

  updateStsStatus("Stopped", "info");
  addLog("⏹️ Conversation stopped", "info");
};

//=============================================================================
// TTS Functions
//=============================================================================

window.initTTS = async function () {
  try {
    // Get voice ID from input
    const voiceInput = (
      document.getElementById("modelPath") as HTMLInputElement
    ).value;

    addLog(`Initializing Piper TTS with voice: ${voiceInput}...`, "info");

    // Create audio player with autoPlay enabled for queue-based playback
    if (sharedAudioPlayer) {
      sharedAudioPlayer.configure({ autoPlay: true });
      // Set callbacks to observe queue behavior
      sharedAudioPlayer.setStatusCallback((status) => addLog(status, "info"));
      sharedAudioPlayer.setPlayingChangeCallback((playing) => {
        addLog(`Playing state: ${playing}`, playing ? "success" : "info");
      });

      addLog("✓ Audio player created with autoPlay enabled", "success");
    }

    // Create synthesizer using the Piper library
    piperSynthesizer = new TTSLogic({
      voiceId: voiceInput,
    });
    await piperSynthesizer.initialize();

    addLog("✓ Piper synthesizer initialized", "success");

    (document.getElementById("synthesizeBtn") as HTMLButtonElement).disabled =
      false;
  } catch (error: any) {
    addLog(`✗ Failed to initialize TTS: ${error.message}`, "error");
    console.error(error);
  }
};

/**
 * Split text into sentences by punctuation marks
 * This allows for streaming synthesis with reduced latency
 */
function splitIntoSentences(text: string): string[] {
  // Split by sentence-ending punctuation while keeping the punctuation
  const sentences = text
    .split(/(?<=[.!?;])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences;
}

window.synthesizeText = async function () {
  if (!piperSynthesizer) {
    addLog("✗ Please initialize TTS first", "error");
    return;
  }

  try {
    const text = (document.getElementById("ttsText") as HTMLTextAreaElement)
      .value;
    if (!text.trim()) {
      addLog("✗ Please enter some text", "error");
      return;
    }

    // Split text into sentences for streaming synthesis
    const sentences = splitIntoSentences(text);
    addLog(
      `📝 Split into ${sentences.length} sentence(s) for streaming`,
      "info"
    );

    const startTime = performance.now();
    let firstSentenceSynthesized = false;

    // Synthesize each sentence and add to queue (non-blocking)
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      addLog(
        `🔄 Synthesizing [${i + 1}/${sentences.length}]: "${sentence.substring(
          0,
          40
        )}${sentence.length > 40 ? "..." : ""}"`,
        "info"
      );

      const sentenceStart = performance.now();
      const result = await piperSynthesizer.synthesize(sentence);
      const sentenceTime = performance.now() - sentenceStart;

      addLog(
        `✓ [${i + 1}] Synthesized ${
          result.audio.length
        } samples (${result.duration.toFixed(2)}s) in ${sentenceTime.toFixed(
          0
        )}ms`,
        "success"
      );

      // Add to audio queue - autoPlay will start playback immediately
      if (sharedAudioPlayer) {
        sharedAudioPlayer.addAudioIntoQueue(result.audio, result.sampleRate);

        if (!firstSentenceSynthesized) {
          const timeToFirstAudio = performance.now() - startTime;
          addLog(
            `⚡ Time to first audio: ${timeToFirstAudio.toFixed(
              0
            )}ms (vs waiting for full synthesis)`,
            "success"
          );
          firstSentenceSynthesized = true;
        }
      }
    }

    const totalSynthTime = performance.now() - startTime;
    addLog(
      `✅ All ${sentences.length} sentences queued in ${totalSynthTime.toFixed(
        0
      )}ms`,
      "success"
    );
    addLog(
      `📊 Queue size: ${sharedAudioPlayer?.getQueueSize() ?? 0} | Playing: ${
        sharedAudioPlayer?.isAudioPlaying() ?? false
      }`,
      "info"
    );

    // Optionally wait for all audio to complete
    if (sharedAudioPlayer) {
      await sharedAudioPlayer.waitForQueueCompletion();
      const totalTime = performance.now() - startTime;
      addLog(
        `🎵 All audio playback complete in ${totalTime.toFixed(0)}ms total`,
        "success"
      );
    }
  } catch (error: any) {
    addLog(`✗ Synthesis failed: ${error.message}`, "error");
    console.error(error);
  }
};

window.stopAudio = function () {
  if (sharedAudioPlayer) {
    sharedAudioPlayer.stopAndClearQueue();
    addLog("Audio stopped and queue cleared", "info");
  }
};

//=============================================================================
// Initialize
//=============================================================================

window.addEventListener("DOMContentLoaded", () => {
  addLog("STT-TTS Library Consumer Sample loaded", "success");
  addLog("Library imported successfully from stt-tts-lib package", "success");

  // Check if we're in a browser that supports the APIs
  if (
    !("webkitSpeechRecognition" in window) &&
    !("SpeechRecognition" in window)
  ) {
    addLog("⚠ Speech Recognition API not supported in this browser", "error");
  } else {
    addLog("✓ Speech Recognition API available", "success");
  }
});

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (sttLogic) {
    sttLogic.destroy();
  }
  if (audioPlayer) {
    sharedAudioPlayer.stop();
  }
});
