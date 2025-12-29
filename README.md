# stt-tts-lib

TypeScript utilities for speech-to-text (STT) and text-to-speech (TTS) in the browser. Ships ESM/CJS bundles with full TypeScript declarations.

**Features:**

- 🎤 **STT**: Browser-native speech recognition with session management
- 🔊 **TTS**: Piper neural TTS with automatic model downloading
- ✅ **Zero Config**: No manual ONNX setup required - everything is handled automatically
- 📦 **Small**: ~135KB package size

## Quick Start

### Installation

```bash
npm install stt-tts-lib
```

### Basic Usage

```typescript
import { STTLogic, TTSLogic, createAudioPlayer } from "stt-tts-lib";

// Speech-to-Text
const stt = new STTLogic(
  (msg, level) => console.log(`[${level}] ${msg}`),
  (transcript) => console.log("Transcript:", transcript)
);
stt.start();

// Text-to-Speech
const synthesizer = new TTSLogic({
  voiceId: "en_US-hfc_female-medium",
});
await synthesizer.initialize();
const player = createAudioPlayer({ sampleRate: 22050 });

const result = await synthesizer.synthesize("Hello world!");
await player.play(result.audio, result.sampleRate);
```

## Vite Configuration (Required)

For Vite-based projects, add this configuration to `vite.config.js`:

```javascript
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    headers: {
      // Required for SharedArrayBuffer (WASM multi-threading)
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    // Force pre-bundling for dev server compatibility
    include: ["onnxruntime-web", "@realtimex/piper-tts-web"],
    esbuildOptions: {
      target: "esnext",
    },
  },
});
```

## Next.js Configuration (Required)

For Next.js projects, you need additional configuration since this library uses browser-only APIs (Web Speech, Web Audio, ONNX WASM).

### 1. Configure Headers in `next.config.js`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for SharedArrayBuffer (WASM multi-threading)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },
  // Exclude ONNX from webpack bundling (it loads WASM dynamically)
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

**Option A: Dynamic Import (Recommended)**

```typescript
"use client";

import { useEffect, useState, useRef } from "react";
import type { TTSLogic, AudioPlayer } from "stt-tts-lib";

export default function SpeechComponent() {
  const [isReady, setIsReady] = useState(false);
  const ttsRef = useRef<TTSLogic | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    // Dynamic import to avoid SSR
    async function initTTS() {
      const { TTSLogic, createAudioPlayer } = await import("stt-tts-lib");

      ttsRef.current = new TTSLogic({
        voiceId: "en_US-hfc_female-medium",
      });
      await ttsRef.current.initialize();

      playerRef.current = createAudioPlayer({ sampleRate: 22050 });
      setIsReady(true);
    }

    initTTS();

    return () => {
      ttsRef.current?.dispose();
      playerRef.current?.close();
    };
  }, []);

  const speak = async (text: string) => {
    if (!ttsRef.current || !playerRef.current) return;
    const result = await ttsRef.current.synthesize(text);
    await playerRef.current.play(result.audio, result.sampleRate);
  };

  return (
    <button onClick={() => speak("Hello from Next.js!")} disabled={!isReady}>
      {isReady ? "Speak" : "Loading..."}
    </button>
  );
}
```

**Option B: Using `next/dynamic` with `ssr: false`**

```typescript
// components/SpeechWrapper.tsx
"use client";

import dynamic from "next/dynamic";

const SpeechComponent = dynamic(() => import("./SpeechComponent"), {
  ssr: false,
  loading: () => <p>Loading speech features...</p>,
});

export default SpeechComponent;
```

### 3. Complete Next.js Example with STT + TTS

```typescript
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { STTLogic, TTSLogic, AudioPlayer } from "stt-tts-lib";

export default function VoiceChat() {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const sttRef = useRef<STTLogic | null>(null);
  const ttsRef = useRef<TTSLogic | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    async function init() {
      const { STTLogic, TTSLogic, createAudioPlayer } = await import(
        "stt-tts-lib"
      );

      // Initialize TTS
      ttsRef.current = new TTSLogic({
        voiceId: "en_US-hfc_female-medium",
      });
      await ttsRef.current.initialize();
      playerRef.current = createAudioPlayer({ sampleRate: 22050 });

      // Initialize STT
      sttRef.current = new STTLogic(
        (msg, level) => console.log(`[STT ${level}]`, msg),
        (text) => setTranscript(text)
      );

      setIsReady(true);
    }

    init();

    return () => {
      sttRef.current?.destroy();
      ttsRef.current?.dispose();
      playerRef.current?.close();
    };
  }, []);

  const toggleListening = useCallback(() => {
    if (!sttRef.current) return;
    if (isListening) {
      sttRef.current.stop();
    } else {
      sttRef.current.start();
    }
    setIsListening(!isListening);
  }, [isListening]);

  const speak = async () => {
    if (!ttsRef.current || !playerRef.current || !transcript) return;
    const result = await ttsRef.current.synthesize(transcript);
    await playerRef.current.play(result.audio, result.sampleRate);
  };

  if (!isReady) return <p>Loading speech features...</p>;

  return (
    <div>
      <button onClick={toggleListening}>
        {isListening ? "Stop Listening" : "Start Listening"}
      </button>
      <p>Transcript: {transcript}</p>
      <button onClick={speak} disabled={!transcript}>
        Read Aloud
      </button>
    </div>
  );
}
```

## Exports

```typescript
// Main bundle (STT + TTS)
import { STTLogic, TTSLogic, createAudioPlayer } from "stt-tts-lib";

// STT only
import { STTLogic, ResetSTTLogic, VADController } from "stt-tts-lib/stt";

// TTS only
import { TTSLogic, createAudioPlayer } from "stt-tts-lib/tts";
```

## API Reference

### STT (Speech-to-Text)

#### `STTLogic`

Main speech recognition controller with session management.

```typescript
const stt = new STTLogic(
  // Log callback
  (message: string, level?: string) => void,
  // Transcript callback
  (transcript: string) => void,
  // Options
  {
    sessionDurationMs?: number,      // Session duration (default: 30000)
    interimSaveIntervalMs?: number,  // Interim save interval (default: 5000)
    preserveTranscriptOnStart?: boolean,
  }
);

// Methods
stt.start();                              // Start listening
stt.stop();                               // Stop listening
stt.destroy();                            // Cleanup resources
stt.getFullTranscript();                  // Get accumulated transcript
stt.clearTranscript();                    // Clear transcript
stt.setWordsUpdateCallback((words) => {}); // Listen for word updates
```

#### `ResetSTTLogic`

Low-level reset logic for custom STT implementations.

```typescript
const reset = new ResetSTTLogic({
  maxSilenceMs: 1500,
  maxUtteranceMs: 8000,
  onReset: (reason, stats) => console.log("reset", reason, stats),
});
```

#### `VADController`

Voice Activity Detection controller.

```typescript
const vad = new VADController({
  activation: -35,
  release: -45,
  hangoverFrames: 10,
});
```

### TTS (Text-to-Speech)

#### `TTSLogic`

Piper TTS synthesizer class. Voice models are downloaded automatically on first use.

```typescript
const synthesizer = new TTSLogic({
  voiceId: "en_US-hfc_female-medium", // Piper voice ID
});
await synthesizer.initialize();

// Synthesize text to audio
const result = await synthesizer.synthesize("Hello world!");
// result.audio: Float32Array
// result.audioBlob: Blob (WAV format)
// result.sampleRate: number
// result.duration: number (seconds)

// Get WAV blob only (faster, no decoding)
const blob = await synthesizer.synthesizeToBlob("Hello world!");

// Cleanup
await synthesizer.dispose();
```

#### `createAudioPlayer(config)`

Creates an audio player for playback.

```typescript
const player = createAudioPlayer({
  sampleRate: 22050,
});

// Play audio
await player.play(audioData, sampleRate);

// Stop playback
player.stop();

// Cleanup
await player.close();
```

### Available Piper Voices

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

## Usage Examples

### Complete STT Example

```typescript
import { STTLogic } from "stt-tts-lib";

// Create STT instance
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

### Complete TTS Example

```typescript
import { TTSLogic, createAudioPlayer } from "stt-tts-lib";

async function speak(text: string) {
  // Initialize (downloads voice model on first use)
  const synthesizer = new TTSLogic({
    voiceId: "en_US-hfc_female-medium",
  });
  await synthesizer.initialize();

  const player = createAudioPlayer({ sampleRate: 22050 });

  // Synthesize and play
  const result = await synthesizer.synthesize(text);
  console.log(`Generated ${result.duration.toFixed(2)}s of audio`);

  await player.play(result.audio, result.sampleRate);

  // Cleanup
  await synthesizer.dispose();
  await player.close();
}

// Usage
speak("Hello! This is Piper text-to-speech running in your browser.");
```

### Combined STT + TTS Example

```typescript
import {
  STTLogic,
  TTSLogic,
  createAudioPlayer,
  type AudioPlayer,
} from "stt-tts-lib";

let stt: STTLogic | null = null;
let tts: TTSLogic | null = null;
let player: AudioPlayer | null = null;

async function init() {
  // Initialize TTS
  tts = new TTSLogic({
    voiceId: "en_US-hfc_female-medium",
  });
  await tts.initialize();
  player = createAudioPlayer({ sampleRate: 22050 });

  // Initialize STT with echo response
  stt = new STTLogic(
    (msg) => console.log(msg),
    async (transcript) => {
      console.log("You said:", transcript);

      // Echo back what was heard
      if (tts && player && transcript.trim()) {
        const result = await tts.synthesize(`You said: ${transcript}`);
        await player.play(result.audio, result.sampleRate);
      }
    }
  );
}

// Start listening
function startListening() {
  stt?.start();
}

// Stop listening
function stopListening() {
  stt?.stop();
}

// Cleanup
function cleanup() {
  stt?.destroy();
  tts?.dispose();
  player?.close();
}
```

## Build & Scripts

```bash
npm run build   # Bundle with tsup (ESM/CJS + d.ts) into dist/
npm run lint    # Type-check with tsc --noEmit
npm run clean   # Remove dist/
```

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

| Issue                                           | Solution                                               |
| ----------------------------------------------- | ------------------------------------------------------ |
| "Module externalized for browser compatibility" | Add `optimizeDeps.include` in Vite config (see above). |
| WASM loading errors                             | Ensure COOP/COEP headers are set in Vite config.       |
| Works in production but not dev                 | Clear `.vite` cache: `rm -rf node_modules/.vite`       |

### Next.js Issues

| Issue                     | Solution                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| "window is not defined"   | Use dynamic import inside `useEffect` or `next/dynamic` with `ssr: false`.  |
| "document is not defined" | Same as above - library must only run on client side.                       |
| SharedArrayBuffer errors  | Ensure COOP/COEP headers are set in `next.config.js` (see Next.js section). |
| WASM file not loading     | Check browser console for CORS errors. Verify headers config is applied.    |
| Hydration mismatch        | Wrap speech components with `dynamic(() => import(...), { ssr: false })`.   |

## License

MIT
