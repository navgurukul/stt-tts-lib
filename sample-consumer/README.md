# STT-TTS Library Consumer Sample

This sample project demonstrates how to consume the `stt-tts-lib` package from the `.tgz` file in your own projects.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Setup](#setup)
3. [Features Demonstrated](#features-demonstrated)
4. [Using in Your Project](#using-in-your-project)
5. [Complete Examples](#complete-examples)

## Quick Start

### Build and Run

```bash
# From the root stt-tts-lib directory
npm run build
npm pack

# Navigate to this sample
cd sample-consumer

# Install dependencies (includes the .tgz)
npm install

# Run the demo
npm run dev
```

Opens browser at `http://localhost:3000` or `http://localhost:3001` with working STT and TTS demos.

## Setup

### 1. Build the library package (if not already done)

From the root `stt-tts-lib` directory:

```bash
npm run build
npm pack
```

This creates `stt-tts-lib-0.1.0.tgz`.

### 2. Install dependencies in this sample

```bash
cd sample-consumer
npm install
```

This will:
- Install the library from the `.tgz` file
- Install required peer dependencies (`onnxruntime-web`)
- Install dev dependencies (`vite`, `typescript`)

### 3. Run the sample

```bash
npm run dev
```

This starts a development server at `http://localhost:3000`.

## Features Demonstrated

### Speech-to-Text (STT)

- Using `ResetSTTLogic` class from the library
- Auto-restart functionality
- Real-time transcript updates
- Heard words tracking
- Import `ResetSTTLogic` from package
- Initialize with callbacks
- Start/stop listening
- Display real-time transcript
- Show heard words

### Text-to-Speech (TTS)

- Using `PiperSynthesizer` for ONNX-based synthesis
- Using `createPiperSynthesizer` helper
- Using `textToPhonemes` converter
- Using `AudioPlayer` for playback
- Import TTS functions from package
- Initialize `PiperSynthesizer`
- Convert text to phonemes
- Synthesize audio
- Play synthesized speech

## What's Included

### Files

- **index.html** - UI with tabs for STT, TTS, and info
- **main.js** - Application logic importing from `stt-tts-lib`
- **ort-setup.js** - ONNX Runtime setup
- **package.json** - Shows how to install the library
- **vite.config.js** - Vite configuration with ORT file serving
- **tsconfig.json** - TypeScript configuration

## Using in Your Project

### Installation

#### Method 1: Install from .tgz Package

```bash
npm install /path/to/stt-tts-lib-0.1.0.tgz
```

Or in `package.json`:

```json
{
  "dependencies": {
    "stt-tts-lib": "file:../path/to/stt-tts-lib-0.1.0.tgz",
    "onnxruntime-web": "^1.20.1"
  }
}
```

#### Method 2: Install from npm (when published)

```bash
npm install stt-tts-lib
```

### Import Syntax

#### Import Everything

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

#### Import STT Only

```javascript
import { ResetSTTLogic, STTLogic, VADController } from 'stt-tts-lib/stt';
```

#### Import TTS Only

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

## Project Structure

```
sample-consumer/
├── index.html          # HTML UI
├── main.js             # Main application logic
├── ort-setup.js        # ONNX Runtime setup
├── package.json        # Dependencies (includes stt-tts-lib)
├── vite.config.js      # Vite configuration
├── tsconfig.json       # TypeScript configuration
└── README.md           # This file
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run install-lib` - Reinstall the library from .tgz

## Troubleshooting

### Port Already in Use

If port 3000 is already in use, Vite will automatically use the next available port (3001, 3002, etc.).

### ONNX Runtime Issues

Ensure `onnxruntime-web` is properly installed:

```bash
npm install onnxruntime-web@^1.20.1
```

### Model Not Found

Make sure the Piper ONNX model is available at the specified path:

```javascript
modelPath: '/models/en_US-lessac-medium.onnx'
```

Check that the model file is served correctly from the public directory.

## Notes

- The library requires `onnxruntime-web` as a peer dependency
- For TTS to work, you need ONNX model files (`.onnx`)
- STT requires browser support for Web Speech API
- See the main library README for more detailed API documentation

## More Information

For detailed information about the `stt-tts-lib` package, see the main [README.md](../README.md) in the root directory.
