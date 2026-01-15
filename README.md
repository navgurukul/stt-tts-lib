# speech-to-speech

TypeScript utilities for speech-to-text (STT) and text-to-speech (TTS) in the browser. Ships ESM/CJS bundles with full TypeScript declarations.

**Features:**

- 🎤 **STT**: Browser-native speech recognition with session management
- 🔊 **TTS**: Piper neural TTS with automatic model downloading
- 🎵 **Shared Audio Queue**: Auto-play audio queue for seamless playback
- ✅ **Zero Config**: No manual ONNX setup required - everything is handled automatically
- 📦 **Small**: ~135KB package size

## Quick Start

### Installation

```bash
npm install speech-to-speech onnxruntime-web
```

> **Note:** `onnxruntime-web` is a peer dependency required for TTS functionality.

### Basic Usage

```typescript
import { STTLogic, TTSLogic, sharedAudioPlayer } from "speech-to-speech";

// Configure shared audio player (auto-plays when audio is added)
sharedAudioPlayer.configure({ autoPlay: true });

// Speech-to-Text
const stt = new STTLogic(
  (msg, level) => console.log(`[${level}] ${msg}`),
  (transcript) => console.log("Transcript:", transcript)
);
stt.start();

// Text-to-Speech with auto-play queue
const tts = new TTSLogic({ voiceId: "en_US-hfc_female-medium" });
await tts.initialize();

const result = await tts.synthesize("Hello world!");
sharedAudioPlayer.addAudioIntoQueue(result.audio, result.sampleRate);
// Audio plays automatically!
```

## Vite Configuration (Required)

For Vite-based projects, add this configuration to `vite.config.ts`:

### Basic Configuration

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000,
    headers: {
      // Required for SharedArrayBuffer (WASM multi-threading)
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    fs: {
      allow: [".."],
    },
  },
  optimizeDeps: {
    // Force pre-bundling for dev server compatibility
    include: ["onnxruntime-web", "@realtimex/piper-tts-web"],
    esbuildOptions: {
      target: "esnext",
    },
  },
  worker: {
    format: "es",
  },
  build: {
    target: "esnext",
  },
  assetsInclude: ["**/*.wasm", "**/*.onnx"],
});
```

### Advanced Configuration (If you encounter WASM loading issues)

If you experience issues with ONNX Runtime WASM files, use this extended configuration:

```typescript
import { defineConfig } from "vite";
import path from "path";
import fs from "fs";

// Custom plugin to serve ONNX runtime files from node_modules
function serveOrtFiles() {
  return {
    name: "serve-ort-files",
    configureServer(server: any) {
      server.middlewares.use("/ort", (req: any, res: any, next: any) => {
        const urlPath = req.url.split("?")[0];
        const filePath = path.join(
          __dirname,
          "node_modules/onnxruntime-web/dist",
          urlPath
        );

        if (fs.existsSync(filePath)) {
          const ext = path.extname(filePath);
          const contentType =
            ext === ".mjs" || ext === ".js"
              ? "application/javascript"
              : ext === ".wasm"
              ? "application/wasm"
              : "application/octet-stream";

          res.setHeader("Content-Type", contentType);
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          fs.createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });
    },
  };
}

// Custom plugin to patch CDN URLs in piper-tts-web
function patchPiperTtsWeb() {
  return {
    name: "patch-piper-tts-web",
    transform(code: string, id: string) {
      if (id.includes("@mintplex-labs/piper-tts-web")) {
        return code.replace(
          /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/onnxruntime-web\/1\.18\.0\//g,
          "/ort/"
        );
      }
      return code;
    },
  };
}

export default defineConfig({
  plugins: [serveOrtFiles(), patchPiperTtsWeb()],
  resolve: {
    alias: {
      "onnxruntime-web/wasm": path.resolve(
        __dirname,
        "node_modules/onnxruntime-web/dist/ort.webgpu.mjs"
      ),
    },
  },
  optimizeDeps: {
    exclude: ["@mintplex-labs/piper-tts-web"],
    include: ["onnxruntime-web"],
    esbuildOptions: {
      define: { global: "globalThis" },
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    fs: { allow: [".."] },
  },
  build: {
    assetsInlineLimit: 0,
  },
});
```

## Next.js Configuration (Required)

For Next.js projects, you need additional configuration since this library uses browser-only APIs.

### 1. Configure Headers in `next.config.js`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
```

### 2. Client-Side Only Usage

Since this library uses browser APIs, you **must** ensure it only runs on the client:

```typescript
"use client";

import { useEffect, useState, useRef } from "react";
import type { TTSLogic } from "speech-to-speech";

export default function SpeechComponent() {
  const [isReady, setIsReady] = useState(false);
  const ttsRef = useRef<TTSLogic | null>(null);

  useEffect(() => {
    async function initTTS() {
      const { TTSLogic, sharedAudioPlayer } = await import("speech-to-speech");

      sharedAudioPlayer.configure({ autoPlay: true });

      ttsRef.current = new TTSLogic({ voiceId: "en_US-hfc_female-medium" });
      await ttsRef.current.initialize();
      setIsReady(true);
    }

    initTTS();
    return () => {
      ttsRef.current?.dispose();
    };
  }, []);

  const speak = async (text: string) => {
    if (!ttsRef.current) return;
    const { sharedAudioPlayer } = await import("speech-to-speech");
    const result = await ttsRef.current.synthesize(text);
    sharedAudioPlayer.addAudioIntoQueue(result.audio, result.sampleRate);
  };

  return (
    <button onClick={() => speak("Hello!")} disabled={!isReady}>
      {isReady ? "Speak" : "Loading..."}
    </button>
  );
}
```

## Exports

```typescript
// Main bundle (STT + TTS)
import {
  STTLogic,
  TTSLogic,
  AudioPlayer,
  createAudioPlayer,
  sharedAudioPlayer,
} from "speech-to-speech";

// STT only
import { STTLogic, ResetSTTLogic, VADController } from "speech-to-speech/stt";

// TTS only
import {
  TTSLogic,
  AudioPlayer,
  createAudioPlayer,
  sharedAudioPlayer,
} from "speech-to-speech/tts";
```

## API Reference

### STT (Speech-to-Text)

#### `STTLogic`

Main speech recognition controller with session management.

```typescript
const stt = new STTLogic(
  // Log callback
  (message: string, level?: "info" | "warning" | "error") => void,
  // Transcript callback
  (transcript: string) => void,
  // Options
  {
    sessionDurationMs?: number,        // Session duration (default: 30000)
    interimSaveIntervalMs?: number,    // Interim save interval (default: 5000)
    preserveTranscriptOnStart?: boolean,
  }
);

// Core methods
stt.start();                           // Start listening
stt.stop();                            // Stop listening
stt.destroy();                         // Cleanup resources
stt.getFullTranscript();               // Get accumulated transcript
stt.clearTranscript();                 // Clear transcript

// Callbacks
stt.setWordsUpdateCallback((words: string[]) => {}); // Word-by-word updates
stt.setMicTimeUpdateCallback((ms: number) => {});    // Mic active time
stt.setVadCallbacks(
  () => console.log("Speech started"),  // onSpeechStart
  () => console.log("Speech ended")     // onSpeechEnd
);
```

### TTS (Text-to-Speech)

#### `TTSLogic`

Piper TTS synthesizer. Voice models download automatically on first use.

```typescript
const tts = new TTSLogic({
  voiceId: "en_US-hfc_female-medium", // Piper voice ID
  warmUp: true, // Pre-warm the model (default: true)
});
await tts.initialize();

// Synthesize text to audio
const result = await tts.synthesize("Hello world!");
// result.audio: Float32Array
// result.audioBlob: Blob (WAV format)
// result.sampleRate: number (22050)
// result.duration: number (seconds)

// Synthesize and add to queue directly
await tts.synthesizeAndAddToQueue("Hello world!");

// Cleanup
await tts.dispose();
```

### Audio Playback

#### `sharedAudioPlayer` (Recommended)

Singleton audio player with auto-play queue. Best for most use cases.

```typescript
import { sharedAudioPlayer } from "speech-to-speech";

// Configure once at app startup
sharedAudioPlayer.configure({
  autoPlay: true, // Auto-play when audio is added (default: false)
  sampleRate: 22050, // Sample rate (default: 22050)
  volume: 1.0, // Volume 0.0-1.0 (default: 1.0)
});

// Add audio to queue (plays automatically if autoPlay is true)
sharedAudioPlayer.addAudioIntoQueue(audioData, sampleRate);

// Manually play queue (if autoPlay is false)
await sharedAudioPlayer.playAudiosFromQueue();

// Queue management
sharedAudioPlayer.getQueueSize(); // Number of items in queue
sharedAudioPlayer.isAudioPlaying(); // Check if playing
sharedAudioPlayer.clearQueue(); // Clear pending audio
sharedAudioPlayer.stopAndClearQueue(); // Stop current + clear queue
await sharedAudioPlayer.waitForQueueCompletion(); // Wait for all audio

// Callbacks
sharedAudioPlayer.setStatusCallback((status: string) => {});
sharedAudioPlayer.setPlayingChangeCallback((playing: boolean) => {});

// Cleanup
await sharedAudioPlayer.stop();
```

#### `createAudioPlayer(config)` / `AudioPlayer`

Creates an independent audio player instance. Use when you need separate players.

```typescript
import { createAudioPlayer, AudioPlayer } from "speech-to-speech";

const player = createAudioPlayer({ sampleRate: 22050, volume: 1.0 });
// or
const player = new AudioPlayer({ sampleRate: 22050 });

// Direct playback (no queue)
await player.play(audioData, sampleRate);

// With queue
player.addAudioIntoQueue(audioData, sampleRate);
await player.playAudiosFromQueue();

// Cleanup
await player.close();
```

## Usage Examples

### Complete STT Example

```typescript
import { STTLogic } from "speech-to-speech";

const stt = new STTLogic(
  (message, level) => console.log(`[STT ${level}] ${message}`),
  (transcript) => {
    document.getElementById("output")!.textContent = transcript;
  },
  {
    sessionDurationMs: 30000,
    interimSaveIntervalMs: 5000,
  }
);

// Listen for individual words
stt.setWordsUpdateCallback((words) => {
  console.log("Heard words:", words);
});

// Detect speech start/end
stt.setVadCallbacks(
  () => console.log("User started speaking"),
  () => console.log("User stopped speaking")
);

// Start listening
stt.start();

// Stop after 10 seconds
setTimeout(() => {
  stt.stop();
  console.log("Final transcript:", stt.getFullTranscript());
}, 10000);

// Cleanup on page unload
window.addEventListener("beforeunload", () => stt.destroy());
```

### Complete TTS with Streaming Queue

Split long text into sentences for faster time-to-first-audio:

```typescript
import { TTSLogic, sharedAudioPlayer } from "speech-to-speech";

// Configure auto-play queue
sharedAudioPlayer.configure({ autoPlay: true });
sharedAudioPlayer.setStatusCallback((s) => console.log(s));
sharedAudioPlayer.setPlayingChangeCallback((playing) => {
  console.log(playing ? "Audio started" : "Audio ended");
});

// Initialize TTS
const tts = new TTSLogic({ voiceId: "en_US-hfc_female-medium" });
await tts.initialize();

// Split text into sentences for streaming
const text =
  "Hello! This is a long response. It will be synthesized sentence by sentence.";
const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());

// Synthesize each sentence and add to queue immediately
for (const sentence of sentences) {
  const result = await tts.synthesize(sentence);
  sharedAudioPlayer.addAudioIntoQueue(result.audio, result.sampleRate);
  // First sentence starts playing while others synthesize!
}

// Wait for all audio to complete
await sharedAudioPlayer.waitForQueueCompletion();
console.log("All audio finished!");
```

### Full Speech-to-Speech Example

Complete voice conversation with LLM integration:

```typescript
import { STTLogic, TTSLogic, sharedAudioPlayer } from "speech-to-speech";

// State
let stt: STTLogic;
let tts: TTSLogic;
let conversationHistory: { role: string; content: string }[] = [];

// Initialize
async function init() {
  // Configure shared audio player
  sharedAudioPlayer.configure({ autoPlay: true });

  // Initialize TTS
  tts = new TTSLogic({ voiceId: "en_US-hfc_female-medium" });
  await tts.initialize();

  // Initialize STT
  stt = new STTLogic(
    (msg, level) => console.log(`[STT] ${msg}`),
    (transcript) => console.log("Transcript:", transcript),
    { sessionDurationMs: 60000 }
  );

  // Process speech when user stops talking
  stt.setVadCallbacks(
    () => console.log("Listening..."),
    async () => {
      const transcript = stt.getFullTranscript();
      if (transcript.trim().length > 3) {
        await processSpeech(transcript);
        stt.clearTranscript();
      }
    }
  );
}

// Send to LLM and speak response
async function processSpeech(userMessage: string) {
  conversationHistory.push({ role: "user", content: userMessage });

  // Call your LLM API
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${YOUR_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful voice assistant. Keep responses brief.",
        },
        ...conversationHistory,
      ],
    }),
  });

  const data = await response.json();
  const aiMessage = data.choices[0].message.content;
  conversationHistory.push({ role: "assistant", content: aiMessage });

  // Speak response sentence by sentence
  const sentences = aiMessage
    .split(/(?<=[.!?])\s+/)
    .filter((s: string) => s.trim());
  for (const sentence of sentences) {
    const result = await tts.synthesize(sentence);
    sharedAudioPlayer.addAudioIntoQueue(result.audio, result.sampleRate);
  }

  await sharedAudioPlayer.waitForQueueCompletion();
}

// Start conversation
function start() {
  stt.start();
}

// Stop conversation
function stop() {
  stt.stop();
  sharedAudioPlayer.stopAndClearQueue();
}
```

## Available Piper Voices

Voice models are downloaded automatically from CDN on first use (~20-80MB per voice).

| Voice ID                  | Language     | Description                    |
| ------------------------- | ------------ | ------------------------------ |
| `en_US-hfc_female-medium` | English (US) | Female, medium quality         |
| `en_US-lessac-medium`     | English (US) | Neutral, medium quality        |
| `en_US-lessac-low`        | English (US) | Neutral, low quality (smaller) |
| `en_US-lessac-high`       | English (US) | Neutral, high quality (larger) |
| `en_GB-alba-medium`       | English (UK) | British accent                 |
| `de_DE-thorsten-medium`   | German       | German voice                   |
| `fr_FR-upmc-medium`       | French       | French voice                   |

See [Piper Voices](https://rhasspy.github.io/piper-samples/) for the complete list.

## Browser Compatibility

| Feature                  | Chrome | Firefox | Safari | Edge |
| ------------------------ | ------ | ------- | ------ | ---- |
| STT (Speech Recognition) | ✅     | ❌      | ✅     | ✅   |
| TTS (Piper ONNX)         | ✅     | ✅      | ✅     | ✅   |
| Web Audio API            | ✅     | ✅      | ✅     | ✅   |

**Note:** Speech Recognition API requires Chrome, Safari, or Edge. Firefox does not support the Web Speech API.

## Troubleshooting

### TTS Issues

| Issue                | Solution                                                                                |
| -------------------- | --------------------------------------------------------------------------------------- |
| "Voice not found"    | Check voice ID spelling. Use `en_US-hfc_female-medium` for testing.                     |
| Slow first synthesis | Normal - voice model (~20MB) downloads on first use. Subsequent calls use cached model. |
| No audio output      | Ensure browser supports Web Audio API. Check volume and audio permissions.              |
| CORS errors          | Ensure Vite config has proper COOP/COEP headers (see above).                            |

### STT Issues

| Issue                              | Solution                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| "Speech Recognition not supported" | Use Chrome, Safari, or Edge. Firefox doesn't support Web Speech API.                       |
| No transcript                      | Check microphone permissions. Ensure `stt.start()` was called.                             |
| Transcript stops                   | Browser sessions timeout after ~30s. Library auto-restarts, but check `sessionDurationMs`. |

### Dev Server Issues (Vite)

| Issue                                           | Solution                                                    |
| ----------------------------------------------- | ----------------------------------------------------------- |
| "Module externalized for browser compatibility" | Add `optimizeDeps.include` in Vite config (see above).      |
| WASM loading errors                             | Ensure COOP/COEP headers are set. Try advanced Vite config. |
| Works in production but not dev                 | Clear `.vite` cache: `rm -rf node_modules/.vite`            |

### Next.js Issues

| Issue                     | Solution                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| "window is not defined"   | Use dynamic import inside `useEffect` or `next/dynamic` with `ssr: false`.  |
| "document is not defined" | Same as above - library must only run on client side.                       |
| SharedArrayBuffer errors  | Ensure COOP/COEP headers are set in `next.config.js` (see Next.js section). |
| WASM file not loading     | Check browser console for CORS errors. Verify headers config is applied.    |

## Build & Scripts

```bash
npm run build   # Bundle with tsup (ESM/CJS + d.ts) into dist/
npm run lint    # Type-check with tsc --noEmit
npm run clean   # Remove dist/
```

## Built With

- **[ONNX Runtime Web](https://github.com/microsoft/onnxruntime)** - ML inference engine for WASM
- **[Piper TTS](https://github.com/rhasspy/piper)** - Neural text-to-speech by Rhasspy
- **[@realtimex/piper-tts-web](https://github.com/synesthesiam/piper)** - Browser wrapper for Piper
- **[Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)** - Browser speech recognition
- **[Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)** - Audio processing

## License

MIT
