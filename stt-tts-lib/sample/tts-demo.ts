import {
  createOrtEnvironment,
  preparePiperVoice,
  streamTokensToSpeech,
} from "../src/tts/index.js";

// ============================================================================
// APPROACH 1: PIPER TTS BACKEND (ONNX Runtime) - Node.js
// ============================================================================
async function piperTtsDemo() {
  console.log("\n=== PIPER TTS DEMO (ONNX Runtime) ===");
  console.log("⚠️  This requires ONNX Runtime and Piper model files to be installed.");
  console.log("For production use, set up:\n  - @onnxruntime/web or @onnxruntime/node\n  - Piper model downloads\n");

  try {
    const voice = preparePiperVoice({ 
      voiceId: "en_US-hfc_female-medium",
      modelPath: "./models/en_US-hfc_female-medium.onnx" // Download from huggingface
    });
    console.log("✓ Voice prepared:", voice);

    const ort = await createOrtEnvironment({ device: "cpu" });
    console.log("✓ ORT environment ready");

    const tokens = ["Hello", " world", "! This is a Piper TTS synthesis."];

    // Stream tokens to speech chunks
    const result = await streamTokensToSpeech(tokens, {
      chunkSize: 12,
      delayMs: 25,
      onChunk: async (text) => {
        console.log(`  [streaming] "${text}"`);
        // In a real app, send this audio chunk to Web Audio API or file writer
      },
    });

    console.log("✓ Synthesis complete:", result);
  } catch (error) {
    console.error("✗ Piper demo error:", error);
  }
}

// ============================================================================
// APPROACH 2: EXTERNAL TTS SERVICE (Google Cloud TTS, Azure, etc.)
// ============================================================================
async function externalTtsDemo() {
  console.log("\n=== EXTERNAL TTS SERVICE DEMO ===");
  console.log("Example: Google Cloud Text-to-Speech API\n");

  const text = "Hello world! This is streamed text to speech.";
  
  // Mock implementation (replace with real service)
  const synthesizeWithExternalService = async (text: string) => {
    console.log(`Sending to external TTS: "${text}"`);
    
    // Example with Google Cloud TTS (pseudo-code):
    // const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${API_KEY}` },
    //   body: JSON.stringify({
    //     input: { text },
    //     voice: { languageCode: 'en-US', name: 'en-US-Neural2-C' },
    //     audioConfig: { audioEncoding: 'MP3' }
    //   })
    // });
    // const data = await response.json();
    // return data.audioContent; // Base64 encoded audio
    
    console.log("  [mock] Would send to Google Cloud TTS API");
    console.log("  [mock] Would receive MP3/WAV audio data");
    return new ArrayBuffer(0); // Mock audio data
  };

  try {
    const audioData = await synthesizeWithExternalService(text);
    console.log("✓ Received audio data:", audioData.byteLength, "bytes");
    console.log("✓ Would play via Web Audio API in browser");
  } catch (error) {
    console.error("✗ External TTS error:", error);
  }
}

// ============================================================================
// APPROACH 3: WEB AUDIO API (Browser only)
// ============================================================================
function printWebAudioNote() {
  console.log("\n=== WEB AUDIO API DEMO (Browser only) ===");
  console.log("✓ To use Web Audio API, run the HTML demo instead:");
  console.log("  → sample/tts-browser-demo.html");
  console.log("  → Open in Chrome and follow instructions\n");

  console.log("Example code for browser (Web Audio API):");
  console.log(`
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const audioData = await getSynthesizedAudio(); // From Piper or external service
  const buffer = await audioContext.decodeAudioData(audioData);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start(0);
  `);
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║          STT-TTS Library - Complete TTS Demo               ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  // Run all approaches
  await piperTtsDemo();
  await externalTtsDemo();
  printWebAudioNote();

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                     SUMMARY                                ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║ Approach 1: Piper TTS                                      ║");
  console.log("║   ✓ Best for: Server-side synthesis, offline               ║");
  console.log("║   ✓ Requires: ONNX Runtime + model files                  ║");
  console.log("║   ✓ Works in: Node.js + Browser                            ║");
  console.log("║                                                            ║");
  console.log("║ Approach 2: External TTS Service                           ║");
  console.log("║   ✓ Best for: High-quality voices, cloud integration       ║");
  console.log("║   ✓ Requires: API key (Google, Azure, ElevenLabs, etc)    ║");
  console.log("║   ✓ Works in: Node.js + Browser                            ║");
  console.log("║                                                            ║");
  console.log("║ Approach 3: Web Audio API                                  ║");
  console.log("║   ✓ Best for: Browser playback, real-time streaming        ║");
  console.log("║   ✓ Requires: Browser environment                          ║");
  console.log("║   ✓ Works in: Browser only (Chrome, Safari, Firefox)       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
