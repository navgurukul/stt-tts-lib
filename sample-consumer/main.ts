/**
 * Sample demonstrating how to consume stt-tts-lib package
 * This imports the library from the installed .tgz package
 *
 * Note: No separate ort-setup.js needed - ORT is configured automatically
 * by the library when you call createPiperSynthesizer()
 */

// Import from the installed stt-tts-lib package
import {
  STTLogic,
  TTSLogic,
  createAudioPlayer,
  type AudioPlayer,
} from "stt-tts-lib";

// Extend Window interface for global functions
declare global {
  interface Window {
    clearLog: () => void;
    startSTT: () => Promise<void>;
    stopSTT: () => void;
    initTTS: () => Promise<void>;
    synthesizeText: () => Promise<void>;
    stopAudio: () => void;
  }
}

// Global state
let sttLogic: STTLogic | null = null;
let piperSynthesizer: TTSLogic | null = null;
let audioPlayer: AudioPlayer | null = null;

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
// TTS Functions
//=============================================================================

window.initTTS = async function () {
  try {
    // Get voice ID from input
    const voiceInput = (
      document.getElementById("modelPath") as HTMLInputElement
    ).value;

    addLog(`Initializing Piper TTS with voice: ${voiceInput}...`, "info");

    // Create synthesizer using the Piper library
    piperSynthesizer = new TTSLogic({
      voiceId: voiceInput,
    });
    await piperSynthesizer.initialize();

    addLog("✓ Piper synthesizer initialized", "success");

    // Create audio player
    if (!audioPlayer) {
      audioPlayer = createAudioPlayer({
        sampleRate: 22050,
      });
      addLog("✓ Audio player created", "success");
    }

    (document.getElementById("synthesizeBtn") as HTMLButtonElement).disabled =
      false;
  } catch (error: any) {
    addLog(`✗ Failed to initialize TTS: ${error.message}`, "error");
    console.error(error);
  }
};

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

    addLog(
      `Synthesizing: "${text.substring(0, 50)}${
        text.length > 50 ? "..." : ""
      }"`,
      "info"
    );

    // Synthesize text - Piper returns audio data
    const result = await piperSynthesizer.synthesize(text);
    addLog(
      `✓ Synthesized ${result.audio.length} samples (${result.duration.toFixed(
        2
      )}s)`,
      "success"
    );

    // Play audio using AudioPlayer
    if (audioPlayer) {
      await audioPlayer.play(result.audio, result.sampleRate);
      addLog("✓ Audio playback complete", "success");
    }
  } catch (error: any) {
    addLog(`✗ Synthesis failed: ${error.message}`, "error");
    console.error(error);
  }
};

window.stopAudio = function () {
  if (audioPlayer) {
    audioPlayer.stop();
    addLog("Audio stopped", "info");
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
    audioPlayer.stop();
  }
});
