# Using stt-tts-lib in Your Project

This guide shows how to consume the `stt-tts-lib` package in your own projects.

## Method 1: Install from .tgz Package

### Step 1: Build and Package the Library

From the `stt-tts-lib` root directory:

```bash
npm run build
npm pack
```

This creates `stt-tts-lib-0.1.0.tgz`.

### Step 2: Install in Your Project

```bash
npm install /path/to/stt-tts-lib-0.1.0.tgz
```

Or add to your `package.json`:

```json
{
  "dependencies": {
    "stt-tts-lib": "file:../stt-tts-lib-0.1.0.tgz",
    "onnxruntime-web": "^1.20.1"
  }
}
```

## Method 2: Install from npm (when published)

```bash
npm install stt-tts-lib
```

## Import Syntax

### Import Everything

```javascript
import { 
  ResetSTTLogic, 
  STTLogic, 
  VADController,
  PiperSynthesizer,
  createPiperSynthesizer,
  createAudioPlayer,
  textToPhonemes
} from 'stt-tts-lib';
```

### Import STT Only

```javascript
import { ResetSTTLogic, STTLogic, VADController } from 'stt-tts-lib/stt';
```

### Import TTS Only

```javascript
import { 
  PiperSynthesizer, 
  createPiperSynthesizer,
  createAudioPlayer,
  preparePiperVoice,
  streamTokensToSpeech
} from 'stt-tts-lib/tts';
```

## Complete Examples

### Speech-to-Text Example

```javascript
import { ResetSTTLogic } from 'stt-tts-lib';

// Create STT instance
const stt = new ResetSTTLogic(
  // Log callback
  (message, level) => {
    console.log(`[${level}] ${message}`);
  },
  
  // Transcript callback
  (fullTranscript, heardWords, sessionStartTranscript) => {
    console.log('Transcript:', fullTranscript);
    console.log('Words:', heardWords);
  },
  
  // Options
  {
    sessionDurationMs: 30000,      // 30 seconds per session
    interimSaveIntervalMs: 5000,   // Save interim results every 5s
    preserveTranscriptOnStart: false
  }
);

// Start listening
stt.start();

// Stop listening
stt.stop();

// Clean up
stt.destroy();
```

### Text-to-Speech Example

```javascript
import { 
  createPiperSynthesizer, 
  textToPhonemes, 
  createAudioPlayer 
} from 'stt-tts-lib';

async function synthesizeAndPlay(text) {
  // 1. Create synthesizer
  const synthesizer = await createPiperSynthesizer({
    modelPath: '/models/en_US-lessac-medium.onnx',
    sampleRate: 22050
  });

  // 2. Convert text to phonemes
  const phonemeIds = await textToPhonemes(text);
  console.log(`Generated ${phonemeIds.length} phonemes`);

  // 3. Synthesize audio
  const result = await synthesizer.synthesize(phonemeIds);
  console.log(`Generated ${result.audio.length} samples`);
  console.log(`Duration: ${result.duration.toFixed(2)}s`);

  // 4. Create audio player
  const player = createAudioPlayer({
    sampleRate: 22050
  });

  // 5. Play the audio
  await player.play(result.audio, result.sampleRate);
  console.log('Playback complete');
}

// Use it
synthesizeAndPlay('Hello! This is a test of the TTS system.');
```

### Streaming TTS Example

```javascript
import { streamTokensToSpeech } from 'stt-tts-lib';

async function streamText(text) {
  const tokens = text.split(' '); // Simple word tokenization

  const handle = await streamTokensToSpeech(tokens, {
    backend: 'cpu',
    autoPrepare: true,
    onStatus: (status) => console.log(status),
    onSentence: (sentence, index) => {
      console.log(`Sentence ${index}: ${sentence}`);
    },
    onSynthesisTime: (id, ms) => {
      console.log(`Synthesis time for sentence ${id}: ${ms}ms`);
    },
    onPlayFinished: () => {
      console.log('Playback finished');
    }
  });

  // Wait for completion
  await handle.finished;
}
```

### VAD (Voice Activity Detection) Example

```javascript
import { VADController } from 'stt-tts-lib';

const vad = new VADController({
  onLog: (msg) => console.log(msg),
  onSpeechStart: () => console.log('Speech started'),
  onSpeechEnd: (audio) => console.log('Speech ended', audio),
  onFrameProcessed: (probs) => console.log('VAD probs:', probs)
});

// Start VAD
await vad.start({
  minSpeechMs: 200,
  startOnLoad: true
});

// Stop VAD
vad.stop();
```

## Running the Sample Consumer

A complete working sample is available in `sample-consumer/`:

```bash
cd sample-consumer
npm install
npm run dev
```

This opens a browser with:
- **STT Tab**: Speech-to-text with real-time transcript
- **TTS Tab**: Text-to-speech with ONNX synthesis
- **Info Tab**: Library documentation and usage examples

## TypeScript Support

The library ships with full TypeScript definitions. Your IDE will provide autocomplete and type checking:

```typescript
import { 
  ResetSTTLogic, 
  type ResetSTTOptions,
  type ResetStats,
  PiperSynthesizer,
  type SynthesisResult
} from 'stt-tts-lib';

const options: ResetSTTOptions = {
  sessionDurationMs: 30000,
  interimSaveIntervalMs: 5000,
  preserveTranscriptOnStart: false
};

const stt = new ResetSTTLogic(
  (msg, level) => console.log(msg),
  (transcript) => console.log(transcript),
  options
);
```

## Peer Dependencies

The library requires:
- `onnxruntime-web` (^1.14.0) - For TTS features
- `@onnxruntime/web` or `@onnxruntime/node` (^1.14.0) - Alternative runtime

Install them in your project:

```bash
npm install onnxruntime-web
```

## Files Included in Package

When you install the `.tgz`, you get:

```
stt-tts-lib/
├── dist/
│   ├── index.mjs          # ESM bundle
│   ├── index.cjs          # CommonJS bundle
│   ├── index.d.ts         # TypeScript definitions
│   ├── stt/
│   │   ├── index.mjs
│   │   ├── index.cjs
│   │   └── index.d.ts
│   └── tts/
│       ├── index.mjs
│       ├── index.cjs
│       └── index.d.ts
├── sample/                # Original samples
├── package.json
└── README.md
```

## Common Issues

### Issue: "Module not found"

Make sure you've installed the package:
```bash
npm install
```

### Issue: "onnxruntime-web not found"

Install the peer dependency:
```bash
npm install onnxruntime-web
```

### Issue: TTS model not loading

Make sure your ONNX model files are in the correct location (e.g., `/public/models/`) and the path is correct.

### Issue: STT not working

The Web Speech API requires:
- HTTPS connection (or localhost)
- Microphone permissions
- Supported browser (Chrome, Edge, Safari)

## Next Steps

- Check out [SETUP_PIPER.md](../SETUP_PIPER.md) for TTS model setup
- See the [README.md](../README.md) for full API documentation
- Explore the working sample in `sample-consumer/`
- Review the original samples in `sample/`
