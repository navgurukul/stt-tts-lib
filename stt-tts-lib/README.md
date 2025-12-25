# stt-tts-lib

TypeScript utilities for speech-to-text (STT), voice activity detection (VAD), and text-to-speech (TTS) flows. Ships ESM/CJS bundles with declarations and simple samples to get you started.

## Installation

```bash
npm install stt-tts-lib
# or if working locally
npm install
npm run build
```

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

### TTS
```ts
import { preparePiperVoice, streamTokensToSpeech, createOrtEnvironment } from "stt-tts-lib/tts";

async function run() {
  const voice = preparePiperVoice({ voiceId: "en_US-lessac" });
  await createOrtEnvironment({ device: "cpu" });

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

## Samples

- STT flow: `sample/stt-demo.ts`
- TTS flow: `sample/tts-demo.ts`

## Troubleshooting

- **No audio output yet**: `streamTokensToSpeech` only batches text; connect it to your renderer.
- **Different ORT provider**: pass `providers` or `device: "webgpu"` to `createOrtEnvironment`.
- **Long-running STT**: lower `maxUtteranceMs` or `maxSilenceMs` in `ResetSTTLogic`.
- **Tree-shaking**: the library is side-effect-free; import only what you need.
