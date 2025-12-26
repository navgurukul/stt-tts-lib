# Sample Consumer - Quick Reference

## What is this?

This is a **complete example** showing how to use the `stt-tts-lib` package in your own projects. It demonstrates consuming the library from the `.tgz` package file.

## Quick Start

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

Opens browser at `http://localhost:3000` with working STT and TTS demos.

## What's Included

### Files

- **index.html** - UI with tabs for STT, TTS, and info
- **main.js** - Application logic importing from `stt-tts-lib`
- **package.json** - Shows how to install the library
- **vite.config.js** - Basic Vite setup
- **README.md** - Setup and usage instructions
- **USAGE_GUIDE.md** - Complete API usage guide

### Features Demonstrated

#### Speech-to-Text
- ✅ Import `ResetSTTLogic` from package
- ✅ Initialize with callbacks
- ✅ Start/stop listening
- ✅ Display real-time transcript
- ✅ Show heard words

#### Text-to-Speech
- ✅ Import TTS functions from package
- ✅ Initialize `PiperSynthesizer`
- ✅ Convert text to phonemes
- ✅ Synthesize audio
- ✅ Play synthesized speech

## Key Code Snippets

### Installing the Package

```json
{
  "dependencies": {
    "stt-tts-lib": "file:../stt-tts-lib-0.1.0.tgz"
  }
}
```

### Importing from Package

```javascript
import { 
  ResetSTTLogic,
  createPiperSynthesizer,
  textToPhonemes,
  createAudioPlayer
} from 'stt-tts-lib';
```

### Using STT

```javascript
const stt = new ResetSTTLogic(
  (msg, level) => console.log(msg),
  (transcript, words) => {
    // Handle transcript updates
  },
  { sessionDurationMs: 30000 }
);
stt.start();
```

### Using TTS

```javascript
const synth = await createPiperSynthesizer({
  modelPath: '/models/en_US-lessac-medium.onnx'
});

const phonemes = await textToPhonemes('Hello world');
const audio = await synth.synthesize(phonemes);

const player = createAudioPlayer();
await player.play(audio.audio, audio.sampleRate);
```

## Directory Structure

```
sample-consumer/
├── index.html           # HTML UI
├── main.js              # Main app logic
├── package.json         # Dependencies
├── vite.config.js       # Vite config
├── tsconfig.json        # TypeScript config
├── README.md            # Setup instructions
├── USAGE_GUIDE.md       # Detailed API guide
└── QUICK_START.md       # This file
```

## Use This Sample As

1. **Reference** - See how to structure your project
2. **Template** - Copy and modify for your needs
3. **Testing** - Verify the library package works correctly
4. **Learning** - Understand the API through working examples

## Next Steps

1. ✅ Run this sample to see everything working
2. 📖 Read [USAGE_GUIDE.md](./USAGE_GUIDE.md) for detailed API docs
3. 🎯 Copy patterns from [main.js](./main.js) to your project
4. 🚀 Build your own STT/TTS application!

## Support

- Main library README: [../README.md](../README.md)
- Piper TTS setup: [../SETUP_PIPER.md](../SETUP_PIPER.md)
- API reference: [USAGE_GUIDE.md](./USAGE_GUIDE.md)
