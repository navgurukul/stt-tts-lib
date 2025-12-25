# stt-tts-lib

TypeScript utilities for speech-to-text (STT), voice activity detection (VAD), and text-to-speech (TTS) flows. Ships ESM/CJS bundles with declarations and simple samples to get you started.

## Quick Start

### Installation

```bash
npm install stt-tts-lib
```

For Piper TTS (ONNX-based speech synthesis), see [SETUP_PIPER.md](./SETUP_PIPER.md) for complete setup instructions.

## Build & Scripts

- `npm run build` — bundle with tsup (ESM/CJS + d.ts) into `dist/`
- `npm run lint` — type-check with `tsc --noEmit`
- `npm run clean` — remove `dist/`

## Exports

- Main: `stt-tts-lib` → STT + TTS exports
- STT-only: `stt-tts-lib/stt`
- TTS-only: `stt-tts-lib/tts`

## API Reference

### STT
- `STTLogic`
  - Methods: `start()`, `stop()`, `destroy()`, `getFullTranscript()`, `clearTranscript()`, `setWordsUpdateCallback()`, `setMicTimeUpdateCallback()`, `setRestartMetricsCallback()`, `setVadCallbacks()`, `getSessionDurationMs()`, `isInAutoRestart()`, `updateInterim()`, `pushFinal()`
  - Behavior: lightweight, timer-based auto-restart window (30s default), mockable via `now`
- `ResetSTTLogic`
  - Options: `maxSilenceMs`, `maxUtteranceMs`, `onReset(reason, stats)`, `now`
  - Methods: `recordSpeechActivity()`, `updatePartialTranscript(text)`, `maybeReset()`, `forceReset(reason)`
- `VADController`
  - Options: `activation`, `release`, `hangoverFrames`, `smoothingWindow`, `now`, `onSpeechStart`, `onSpeechEnd`
  - Methods: `start()`, `stop()`, `handleFrame(energy)`, `getState()`

### TTS
- `preparePiperVoice(config)` → normalized Piper voice settings
- `streamTokensToSpeech(tokens, options)` → batches tokens and calls `onChunk`
- `createOrtEnvironment(config)` / `ensureOrtReady(config)` → minimal ORT bootstrap helper
- `ensureVoiceLoaded(config)`, `warmupPiper(config, synth, text?)`, `resetVoiceCache()`
- `getBackendLabel(device)`, `isCorruptModelError(err)`
- Streaming helpers: `useStreamingTTS(options)`, `synthesizerWorker`, `playerWorker`, `handleChunk`, `emitSentence`, `nextBoundaryIndex`, `getAsyncIterator`, `SimpleQueue`

## Usage Examples

### STT + VAD (low-level)
```ts
import { ResetSTTLogic, VADController } from "stt-tts-lib/stt";

const vad = new VADController({ activation: -35, release: -45 });
const reset = new ResetSTTLogic({
  maxSilenceMs: 1500,
  maxUtteranceMs: 8000,
  onReset: (reason, stats) => console.log("reset", reason, stats),
});

const energies = [-60, -40, -32, -28, -42, -55];
let ts = Date.now();
for (const energy of energies) {
  ts += 200;
  const { state } = vad.handleFrame(energy, ts);
  if (state === "speech") {
    reset.recordSpeechActivity(ts);
    reset.updatePartialTranscript("hello so far", ts);
  }
  reset.maybeReset(ts);
}
```

### STTLogic (session wrapper)
```ts
import { STTLogic } from "stt-tts-lib/stt";

const stt = new STTLogic({ sessionDurationMs: 20_000 });
stt.setWordsUpdateCallback((finalText, interim) => {
  console.log("final", finalText);
  console.log("interim", interim);
});
stt.setMicTimeUpdateCallback((ms) => console.log("mic ms", ms));

stt.start();
stt.updateInterim("hello wor");
stt.updateInterim("hello world");
stt.pushFinal("hello world");
stt.stop();
```

### TTS (Basic - Configuration Only)
```ts
import { preparePiperVoice, streamTokensToSpeech, createOrtEnvironment } from "stt-tts-lib/tts";

async function run() {
  const voice = preparePiperVoice({ voiceId: "en_US-lessac" });
  await createOrtEnvironment({ device: "cpu" });

  const tokens = ["Hello", " ", "world", "!"];
  await streamTokensToSpeech(tokens, {
    chunkSize: 10,
    delayMs: 50,
    onChunk: async (text) => console.log("streaming chunk:", text),
  });
}
```

### TTS (Complete - Real Synthesis with ONNX)
```ts
import { createPiperSynthesizer, textToPhonemes, createAudioPlayer } from "stt-tts-lib/tts";

async function synthesizeSpeech() {
  // 1. Create and initialize synthesizer
  const synthesizer = await createPiperSynthesizer({
    modelPath: '/models/en_US-lessac-medium.onnx',
    sampleRate: 22050
  });

  // 2. Create audio player
  const player = createAudioPlayer({
    sampleRate: 22050,
    volume: 1.0
  });

  // 3. Convert text to phonemes
  const phonemes = textToPhonemes("Hello world!");

  // 4. Synthesize audio
  const result = await synthesizer.synthesize(phonemes);
  console.log(`Synthesized ${result.duration.toFixed(2)}s of audio`);

  // 5. Play audio
  await player.play(result.audio, result.sampleRate);

  // 6. Cleanup
  await synthesizer.dispose();
  await player.close();
}
```

**Note:** The complete synthesis requires:
- `npm install @onnxruntime/web`
- Downloading Piper ONNX models from [HuggingFace](https://huggingface.co/rhasspy/piper-voices)
- Setting up ONNX Runtime files in `public/ort/`
- See [SETUP_PIPER.md](./SETUP_PIPER.md) for detailed setup instructions

  const tokens = ["Hello", " world", "! Streaming TTS is easy."];
  await streamTokensToSpeech(tokens, {
    chunkSize: 12,
    delayMs: 10,
    onChunk: (text) => console.log("speak:", text),
  });
}

run();
```

### Streaming TTS helper
```ts
import { useStreamingTTS } from "stt-tts-lib/tts";

const tts = useStreamingTTS({
  voice: { voiceId: "en_US-lessac" },
  chunkSize: 32,
  delayMs: 10,
});

await tts.ensureReady();
await tts.addChunk("Hello there, this is a streaming TTS demo. ");
await tts.addChunk("More text will be buffered and spoken.");
await tts.finishStreaming();
```

## Documentation

- **[SETUP_PIPER.md](./SETUP_PIPER.md)** - Complete Piper TTS setup, architecture, integration guide, and troubleshooting
- **Samples**: See `sample/` directory for working examples

## Setup for Browser-based TTS (Piper + ONNX)

### 1. Install ONNX Runtime

```bash
npm install @onnxruntime/web
```

### 2. Setup ONNX Runtime Files

Copy ONNX Runtime WASM and JavaScript files to your public folder:

```bash
# Create public/ort folder
mkdir -p public/ort

# Copy ONNX Runtime files (Windows)
copy node_modules\onnxruntime-web\dist\*.wasm public\ort\
copy node_modules\onnxruntime-web\dist\*.js public\ort\

# Or on macOS/Linux:
cp node_modules/onnxruntime-web/dist/*.wasm public/ort/
cp node_modules/onnxruntime-web/dist/*.js public/ort/
```

**Files needed in `public/ort/`:**
- `ort.all.min.js` - Main ONNX Runtime library
- `ort-wasm-simd-threaded.wasm` - WASM runtime
- `ort-wasm-simd-threaded.jsep.wasm` - JSEP backend (optional)

### 3. Download Piper ONNX Models

Create a `models/` folder and download Piper voices from [HuggingFace](https://huggingface.co/rhasspy/piper-voices):

```bash
# Create models folder
mkdir -p models

# Download a model (example: en_US-lessac-medium)
# Option 1: Using curl/wget
wget -O models/en_US-lessac-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx

# Option 2: Using PowerShell
Invoke-WebRequest -Uri "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx" `
  -OutFile "models/en_US-lessac-medium.onnx"
```

**Popular Models:**
- `en_US-lessac-medium` (22MB) - Good quality, recommended
- `en_US-lessac-low` (2.2MB) - Lower quality, smaller
- `en_US-lessac-high` (80MB) - Highest quality
- `en_GB-alan-medium` (22MB) - British English

### 4. Update HTML Import Map

Add this to your HTML `<head>`:

```html
<script type="importmap">
  {
    "imports": {
      "onnxruntime-web": "/ort/ort.all.min.js"
    }
  }
</script>
```

### 5. Test with Demo

Open `sample/piper-complete-demo.html` in your browser:
1. Click **"Demo"** tab
2. Verify model path: `/models/en_US-lessac-medium.onnx`
3. Click **"Initialize Synthesizer"**
4. Enter text and click **"Synthesize & Play"**

## Troubleshooting

- **ONNX Runtime not found**: Ensure `public/ort/` folder exists with `.wasm` and `.js` files
- **Model fetch failed (404)**: Check model path and ensure `/models/` folder is served by your web server
- **No audio output**: Verify browser supports Web Audio API and model initialization was successful
- **Large file sizes**: Models range from 2MB to 80MB; consider using low-quality models for faster downloads

For more detailed TTS setup and architecture, see [SETUP_PIPER.md](./SETUP_PIPER.md).
