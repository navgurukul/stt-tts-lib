# Piper TTS Setup & Integration Guide

Complete guide to set up, configure, and integrate ONNX-based Piper text-to-speech into your projects.

## Table of Contents

1. [Installation & Setup](#installation--setup)
2. [Architecture Overview](#architecture-overview)
3. [Vite/React Integration](#vitereact-integration)
4. [Usage Examples](#usage-examples)
5. [Advanced Configuration](#advanced-configuration)
6. [Troubleshooting](#troubleshooting)

---

## Installation & Setup

### Prerequisites

- Node.js 16+
- Windows: Use `cmd.exe` (PowerShell execution policy may block npm)
- npm or yarn

### Step 1: Install Dependencies

```bash
# Core library
npm install stt-tts-lib

# ONNX Runtime (optional for Piper TTS)
npm install @onnxruntime/web
```

**Note for Windows**: If npm fails in PowerShell, use `cmd.exe`:
```cmd
npm install @onnxruntime/web
```

### Step 2: Download Piper Models

Download ONNX models from [HuggingFace Piper Voices](https://huggingface.co/rhasspy/piper-voices):

```bash
# Create model directory
mkdir -p public/models

# Download en_US-lessac-medium (recommended, 22MB)
cd public/models
curl -O https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
curl -O https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

**Alternative voices:**
- `en_US-lessac-low` - Lower quality, smaller (2.2MB)
- `en_US-lessac-high` - Higher quality, larger (80MB)
- See [HuggingFace](https://huggingface.co/rhasspy/piper-voices) for more languages

### Step 3: Copy ONNX WASM Runtime Files

```bash
# Create WASM directory
mkdir -p public/ort

# Copy WASM files
# Windows cmd:
copy node_modules\onnxruntime-web\dist\*.wasm public\ort\
copy node_modules\onnxruntime-web\dist\*.wasm.map public\ort\

# Windows PowerShell:
Copy-Item node_modules/onnxruntime-web/dist/*.wasm public/ort/
Copy-Item node_modules/onnxruntime-web/dist/*.wasm.map public/ort/

# macOS/Linux:
cp node_modules/onnxruntime-web/dist/*.wasm public/ort/
cp node_modules/onnxruntime-web/dist/*.wasm.map public/ort/
```

### Step 4: Configure Vite (If Using Vite)

Update or create `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'; // if using React
import { onnxWasmPlugin } from './vite-onnx-plugin';

export default defineConfig({
  plugins: [
    react(), // or your framework plugin
    onnxWasmPlugin(), // Serves /ort/ path with WASM files
  ],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
});
```

Copy `vite-onnx-plugin.ts` from the stt-tts-lib package to your project root.

### Step 5: Build & Test

```bash
npm run build
npx -y serve sample
# Open http://localhost:3000/piper-complete-demo.html
```

---

## Architecture Overview

### Data Flow

```
Text Input
    ↓
[Tokenization/Phonemes]
    ↓
[ONNX Model] ← en_US-lessac-medium.onnx
    ↓
[Audio Generation]
    ↓
[SimpleQueue Buffering]
    ↓
[Web Audio API]
    ↓
Speaker Output
```

### Core Components

| Component | Purpose | File |
|-----------|---------|------|
| **Synthesizer** | Converts text to audio via ONNX | `piper-synthesizer.ts` |
| **Audio Player** | Schedules & plays audio buffers | `audio-player.ts` |
| **SimpleQueue** | Async buffer queue for synthesis/playback | `simple-queue.ts` |
| **ONNX Config** | Runtime environment setup | `ort-setup.ts` |
| **Voice Loader** | Downloads models with retry | `prepare-piper-voice.ts` |
| **Workers** | Parallel synthesis & playback | `piper.ts` |

### Key Implementation Patterns

#### 1. SimpleQueue for Buffering
Decouples synthesis from playback:
```typescript
const queue = new SimpleQueue<SynthResult>();

// Producer (synthesizer)
queue.enqueue({ audio, sampleRate });

// Consumer (player)
const { audio, sampleRate } = await queue.dequeue();
```

#### 2. Worker Architecture
Parallel synthesis and playback:
```typescript
const queue = new SimpleQueue();
const synthPromise = synthesizerWorker(tokens, queue, synthesizer);
const playPromise = playerWorker(queue, audioPlayer);
await Promise.all([synthPromise, playPromise]);
```

#### 3. Retry Logic for Downloads
Handles network failures gracefully:
```typescript
async function downloadWithRetry(
  url: string,
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<ArrayBuffer>
```

#### 4. Corrupt Model Detection
Detects and reports cache issues:
```typescript
if (error.message.includes('No graph was found in the protobuf')) {
  throw new Error('Corrupt model cache - clear browser cache');
}
```

#### 5. ONNX Configuration
Single-threaded for browser compatibility:
```typescript
ort.env.wasm.wasmPaths = '/ort/';
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
```

---

## Vite/React Integration

### Create Custom Hook

```typescript
// hooks/useTTS.ts
import { useState, useCallback } from 'react';
import { 
  createPiperSynthesizer, 
  createAudioPlayer,
  textToPhonemes,
  type PiperSynthesizer,
  type AudioPlayer
} from 'stt-tts-lib/tts';

export function useTTS() {
  const [synthesizer, setSynthesizer] = useState<PiperSynthesizer | null>(null);
  const [player, setPlayer] = useState<AudioPlayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const initialize = useCallback(async () => {
    try {
      const synth = await createPiperSynthesizer({
        modelPath: '/models/en_US-lessac-medium.onnx',
        sampleRate: 22050,
        wasmPaths: '/ort/',
      });

      const audioPlayer = createAudioPlayer({
        sampleRate: 22050,
        volume: 1.0,
      });

      setSynthesizer(synth);
      setPlayer(audioPlayer);
      setIsReady(true);
    } catch (error) {
      console.error('TTS initialization failed:', error);
      throw error;
    }
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!synthesizer || !player || !isReady) {
      throw new Error('TTS not initialized');
    }

    try {
      setIsSpeaking(true);
      const phonemes = textToPhonemes(text);
      const result = await synthesizer.synthesize(phonemes);
      await player.play(result.audio, result.sampleRate);
      setIsSpeaking(false);
    } catch (error) {
      setIsSpeaking(false);
      console.error('Speech synthesis failed:', error);
      throw error;
    }
  }, [synthesizer, player, isReady]);

  const cleanup = useCallback(async () => {
    if (synthesizer) await synthesizer.dispose();
    if (player) await player.close();
    setSynthesizer(null);
    setPlayer(null);
    setIsReady(false);
  }, [synthesizer, player]);

  return { initialize, speak, cleanup, isReady, isSpeaking };
}
```

### Use in Component

```typescript
// components/TTSDemo.tsx
import { useEffect } from 'react';
import { useTTS } from '../hooks/useTTS';

export function TTSDemo() {
  const { initialize, speak, cleanup, isReady, isSpeaking } = useTTS();

  useEffect(() => {
    initialize();
    return () => cleanup();
  }, [initialize, cleanup]);

  return (
    <div>
      <h1>Text-to-Speech Demo</h1>
      <textarea id="text" placeholder="Enter text to speak..." />
      <button 
        onClick={() => speak((document.getElementById('text') as HTMLTextAreaElement).value)}
        disabled={!isReady || isSpeaking}
      >
        {isSpeaking ? 'Speaking...' : 'Speak'}
      </button>
      {!isReady && <p>Loading TTS engine...</p>}
    </div>
  );
}
```

### Streaming TTS (Advanced)

For real-time AI response streaming:

```typescript
// For AI-generated tokens
async function* getAITokens(prompt: string) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value);
  }
}

// Use with streaming TTS
import { synthesizerWorker, playerWorker, SimpleQueue } from 'stt-tts-lib/tts';

const queue = new SimpleQueue();
const synthPromise = synthesizerWorker(getAITokens(prompt), queue, synthesizer);
const playPromise = playerWorker(queue, audioPlayer);
await Promise.all([synthPromise, playPromise]);
```

---

## Usage Examples

### Basic Synthesis

```typescript
import { 
  createPiperSynthesizer, 
  textToPhonemes, 
  createAudioPlayer 
} from 'stt-tts-lib/tts';

async function synthesizeSpeech() {
  // 1. Initialize
  const synth = await createPiperSynthesizer({
    modelPath: '/models/en_US-lessac-medium.onnx',
  });
  const player = createAudioPlayer({ sampleRate: 22050 });

  // 2. Convert and synthesize
  const phonemes = textToPhonemes('Hello world!');
  const result = await synth.synthesize(phonemes);

  // 3. Play
  await player.play(result.audio, result.sampleRate);

  // 4. Cleanup
  await synth.dispose();
  await player.close();
}
```

### Streaming Synthesis

```typescript
import { useStreamingTTS } from 'stt-tts-lib/tts';

const tts = useStreamingTTS({
  voice: { voiceId: 'en_US-lessac' },
  chunkSize: 32,
  delayMs: 10,
});

await tts.ensureReady();
await tts.addChunk('Hello there, ');
await tts.addChunk('this is streaming TTS.');
await tts.finishStreaming();
```

### Ensure Ready Pattern

```typescript
import { ensureOrtReady, ensureVoiceLoaded, warmupPiper } from 'stt-tts-lib/tts';

// Initialize ONNX Runtime
await ensureOrtReady({ device: 'cpu' });

// Load and warmup voice model
await ensureVoiceLoaded({ voiceUrl: '/models/en_US-lessac-medium.onnx' });
await warmupPiper({ text: 'Warming up.' });

// Now ready for synthesis
```

---

## Advanced Configuration

### ONNX Runtime Options

```typescript
import { createOrtEnvironment } from 'stt-tts-lib/tts';

const env = await createOrtEnvironment({
  device: 'cpu', // or 'webgpu'
  logLevel: 'warning', // 'verbose', 'warning', 'error'
  providers: ['wasm'], // or ['webgpu', 'wasm']
});
```

### Custom Model Paths

```typescript
const synth = await createPiperSynthesizer({
  modelPath: '/path/to/custom-model.onnx',
  configPath: '/path/to/custom-config.json',
  sampleRate: 22050,
  numThreads: 1,
  wasmPaths: '/ort/', // WASM files location
});
```

### Audio Player Configuration

```typescript
const player = createAudioPlayer({
  sampleRate: 22050,
  volume: 0.8,
  bufferSize: 4096,
});

// Adjust volume
player.setVolume(0.5);

// Stop playback
player.stop();
```

---

## Usage

### Basic Example

```typescript
import { createPiperSynthesizer, textToPhonemes } from 'stt-tts-lib/tts';
import { createAudioPlayer } from 'stt-tts-lib/tts';

// Create synthesizer
const synthesizer = await createPiperSynthesizer({
  modelPath: '/models/en_US-lessac-medium.onnx',
  sampleRate: 22050
});

// Create audio player
const player = createAudioPlayer({
  sampleRate: 22050,
  volume: 1.0
});

// Convert text to phonemes (simplified - use proper phonemizer in production)
const phonemes = textToPhonemes("Hello world!");

// Synthesize speech
const result = await synthesizer.synthesize(phonemes);

// Play audio
await player.play(result.audio, result.sampleRate);

console.log(`Played ${result.duration.toFixed(2)}s of audio`);

// Cleanup
await synthesizer.dispose();
await player.close();
```

### Browser Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>Piper TTS Demo</title>
</head>
<body>
  <button id="speak">Speak</button>
  
  <script type="module">
    import { createPiperSynthesizer, textToPhonemes, createAudioPlayer } from './dist/tts/index.js';
    
    let synthesizer = null;
    let player = null;
    
    document.getElementById('speak').addEventListener('click', async () => {
      // Initialize on first click
      if (!synthesizer) {
        synthesizer = await createPiperSynthesizer({
          modelPath: '/models/en_US-lessac-medium.onnx',
          sampleRate: 22050
        });
        player = createAudioPlayer();
      }
      
      // Synthesize and play
      const phonemes = textToPhonemes("Hello from Piper TTS!");
      const result = await synthesizer.synthesize(phonemes);
      await player.play(result.audio, result.sampleRate);
    });
  </script>
</body>
</html>
```

---

## References

- [ONNX Runtime Web Docs](https://onnxruntime.ai/docs/tutorials/web/)
- [Piper TTS Project](https://github.com/rhasspy/piper)
- [HuggingFace Piper Voices](https://huggingface.co/rhasspy/piper-voices)
- [Web Audio API Docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---

**Last Updated**: December 2025  
**Status**: Production-ready implementation
