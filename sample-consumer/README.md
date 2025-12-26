# STT-TTS Library Consumer Sample

This sample project demonstrates how to consume the `stt-tts-lib` package from the `.tgz` file in your own projects.

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

### Text-to-Speech (TTS)
- Using `PiperSynthesizer` for ONNX-based synthesis
- Using `createPiperSynthesizer` helper
- Using `textToPhonemes` converter
- Using `AudioPlayer` for playback

## Usage in Your Project

### Installation

```bash
npm install ./stt-tts-lib-0.1.0.tgz
```

Or in `package.json`:

```json
{
  "dependencies": {
    "stt-tts-lib": "file:../path/to/stt-tts-lib-0.1.0.tgz"
  }
}
```

### Import Examples

```javascript
// Import everything from main entry
import { ResetSTTLogic, PiperSynthesizer, createAudioPlayer } from 'stt-tts-lib';

// Or import from submodules
import { ResetSTTLogic, STTLogic, VADController } from 'stt-tts-lib/stt';
import { PiperSynthesizer, AudioPlayer, preparePiperVoice } from 'stt-tts-lib/tts';
```

### STT Example

```javascript
import { ResetSTTLogic } from 'stt-tts-lib';

const stt = new ResetSTTLogic(
  (msg, level) => console.log(`[${level}] ${msg}`),
  (transcript, heardWords) => {
    console.log('Transcript:', transcript);
    console.log('Words:', heardWords);
  },
  {
    sessionDurationMs: 30000,
    interimSaveIntervalMs: 5000
  }
);

stt.start();
```

### TTS Example

```javascript
import { createPiperSynthesizer, textToPhonemes, createAudioPlayer } from 'stt-tts-lib';

// Initialize synthesizer
const synthesizer = await createPiperSynthesizer({
  modelPath: '/models/en_US-lessac-medium.onnx',
  sampleRate: 22050
});

// Synthesize speech
const phonemes = await textToPhonemes('Hello world');
const result = await synthesizer.synthesize(phonemes);

// Play audio
const player = createAudioPlayer({ sampleRate: 22050 });
await player.play(result.audio, result.sampleRate);
```

## Project Structure

```
sample-consumer/
├── index.html          # HTML UI
├── main.js             # Main application logic
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

## Notes

- The library requires `onnxruntime-web` as a peer dependency
- For TTS to work, you need ONNX model files (`.onnx`)
- STT requires browser support for Web Speech API
- See the main library README for more detailed API documentation
