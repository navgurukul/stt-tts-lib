/**
 * Sample demonstrating how to consume stt-tts-lib package
 * This imports the library from the installed .tgz package
 */

// Configure ONNX Runtime before using TTS
import './ort-setup.js';

// Import from the installed stt-tts-lib package
import { 
  STTLogic,
  PiperSynthesizer,
  createPiperSynthesizer,
  createAudioPlayer,
  textToPhonemes
} from 'stt-tts-lib';

// Global state
let sttLogic = null;
let piperSynthesizer = null;
let audioPlayer = null;

// Utility: Add log entry
function addLog(message, type = 'info') {
  const logDiv = document.getElementById('log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  logDiv.appendChild(entry);
  logDiv.scrollTop = logDiv.scrollHeight;
  console.log(`[${type}] ${message}`);
}

function clearLog() {
  document.getElementById('log').innerHTML = '';
}

// Expose to window for HTML onclick handlers
window.clearLog = clearLog;

//=============================================================================
// STT Functions
//=============================================================================

window.startSTT = async function() {
  try {
    addLog('Starting Speech-to-Text...', 'info');

    // Initialize STT Logic if not already done
    if (!sttLogic) {
      addLog('Initializing STTLogic from stt-tts-lib...', 'info');
      
      sttLogic = new STTLogic(
        // onLog callback
        (msg, level) => addLog(`[STT] ${msg}`, level || 'info'),
        // onTranscript callback
        (transcript) => {
          document.getElementById('transcript').value = transcript;
        },
        // options
        {
          sessionDurationMs: 30000, // 30 seconds per session
          interimSaveIntervalMs: 5000,
          preserveTranscriptOnStart: false
        }
      );
      
      // Hook word updates to display heard words
      sttLogic.setWordsUpdateCallback((heardWords) => {
        const wordsDiv = document.getElementById('heardWords');
        if (heardWords.length > 0) {
          wordsDiv.innerHTML = heardWords.map(w => 
            `<span style="padding: 4px 8px; margin: 2px; background: #e3f2fd; border-radius: 4px; display: inline-block;">${w}</span>`
          ).join(' ');
        } else {
          wordsDiv.innerHTML = '<em>No words yet</em>';
        }
      });

      addLog('✓ STTLogic initialized successfully', 'success');
    }

    sttLogic.start();
    
    document.getElementById('startSttBtn').disabled = true;
    document.getElementById('stopSttBtn').disabled = false;
    
    addLog('✓ Listening started', 'success');
  } catch (error) {
    addLog(`✗ Failed to start STT: ${error.message}`, 'error');
    console.error(error);
  }
};

window.stopSTT = function() {
  if (sttLogic) {
    sttLogic.stop();
    document.getElementById('startSttBtn').disabled = false;
    document.getElementById('stopSttBtn').disabled = true;
    addLog('✓ Listening stopped', 'info');
  }
};

//=============================================================================
// TTS Functions
//=============================================================================

window.initTTS = async function() {
  try {
    const modelPath = document.getElementById('modelPath').value;
    addLog(`Initializing Piper TTS with model: ${modelPath}...`, 'info');

    // Create synthesizer using the library function
    piperSynthesizer = await createPiperSynthesizer({
      modelPath: modelPath,
      sampleRate: 22050
    });

    addLog('✓ Piper synthesizer initialized', 'success');

    // Create audio player
    if (!audioPlayer) {
      audioPlayer = createAudioPlayer({
        sampleRate: 22050
      });
      addLog('✓ Audio player created', 'success');
    }

    document.getElementById('synthesizeBtn').disabled = false;
  } catch (error) {
    addLog(`✗ Failed to initialize TTS: ${error.message}`, 'error');
    console.error(error);
  }
};

window.synthesizeText = async function() {
  if (!piperSynthesizer) {
    addLog('✗ Please initialize TTS first', 'error');
    return;
  }

  try {
    const text = document.getElementById('ttsText').value;
    if (!text.trim()) {
      addLog('✗ Please enter some text', 'error');
      return;
    }

    addLog(`Synthesizing: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`, 'info');

    // Convert text to phonemes
    const phonemeIds = await textToPhonemes(text);
    addLog(`✓ Generated ${phonemeIds.length} phonemes`, 'info');

    // Synthesize audio
    const result = await piperSynthesizer.synthesize(phonemeIds);
    addLog(`✓ Synthesized ${result.audio.length} audio samples (${result.duration.toFixed(2)}s)`, 'success');

    // Play audio
    if (audioPlayer) {
      await audioPlayer.play(result.audio, result.sampleRate);
      addLog('✓ Audio playback complete', 'success');
    }
  } catch (error) {
    addLog(`✗ Synthesis failed: ${error.message}`, 'error');
    console.error(error);
  }
};

window.stopAudio = function() {
  if (audioPlayer) {
    audioPlayer.stop();
    addLog('Audio stopped', 'info');
  }
};

//=============================================================================
// Initialize
//=============================================================================

window.addEventListener('DOMContentLoaded', () => {
  addLog('STT-TTS Library Consumer Sample loaded', 'success');
  addLog('Library imported successfully from stt-tts-lib package', 'success');
  
  // Check if we're in a browser that supports the APIs
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    addLog('⚠ Speech Recognition API not supported in this browser', 'error');
  } else {
    addLog('✓ Speech Recognition API available', 'success');
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (sttLogic) {
    sttLogic.destroy();
  }
  if (audioPlayer) {
    audioPlayer.stop();
  }
});
