# STT-TTS Library - Comprehensive Speech Recognition Toolkit

## Overview
**stt-tts-lib** is a production-ready TypeScript library that brings powerful speech-to-text and text-to-speech capabilities to web applications. Built on top of the Web Speech API and ONNX Runtime, this library provides a robust, fault-tolerant STT engine with automatic session management and comprehensive callback support.

Perfect for applications requiring real-time speech input with automatic recovery from network hiccups, transcript buffering for long sessions, and detailed metrics on speech recognition performance.

### Library Components
- **ResetSTTLogic**: Low-level speech recognition engine with auto-restart and error recovery
- **STTLogic**: High-level session wrapper for managing continuous speech input with callbacks
- **VADController**: Voice Activity Detection for speech boundary detection
- **Piper TTS Integration**: Full text-to-speech support with streaming capabilities
- **Complete TypeScript Support**: Full type definitions for all public APIs

### Core Capabilities
- ✅ **Browser-Native Speech Recognition**: Uses native Web Speech API with intelligent fallbacks
- ✅ **Automatic Session Restart**: 30-second auto-restart mechanism for long-duration listening
- ✅ **Intelligent Transcript Management**: Smart repeat collapsing, overlap detection, and buffering
- ✅ **Error Recovery**: Graceful handling of common speech recognition failures with automatic recovery
- ✅ **Detailed Metrics**: Track mic time, restart events, first-result timing, and transcript statistics
- ✅ **Callback Integration**: Comprehensive callbacks for words, mic time, restart metrics, and VAD signals
- ✅ **Framework Agnostic**: Works in vanilla JS, React, Vue, Angular, and any other framework

## ResetSTTLogic Class - Full Implementation

### ✅ Complete Features Implemented

#### 1. **Initialization & Configuration**
- Constructor with proper SpeechRecognition API detection
- Support for options:
  - `sessionDurationMs` (30s default): Auto-restart window
  - `interimSaveIntervalMs` (5s default): Save interim results interval
  - `preserveTranscriptOnStart`: Keep previous transcript on restart

#### 2. **Core Speech Recognition Setup**
- **setupRecognition()** - Configures browser's native SpeechRecognition API:
  - Language: English (en-US)
  - Continuous listening
  - Interim results enabled
  - Event handlers for result, error, end, start

#### 3. **Transcript Management**
- **getFullTranscript()**: Returns complete transcript including pre-restart buffer
- **clearTranscript()**: Resets all transcript buffers
- **saveInterimToFinal()**: Periodically saves interim text to final transcript
- Repeat collapsing to remove duplicated words/phrases
- Suffix appending logic for overlapping text

#### 4. **Auto-Restart Mechanism** (30s Auto-Restart Window)
- **performRestart()**: Automatic restart every 30 seconds of mic time
  - Buffers current transcript before restart
  - Cleanly stops recognition
  - Waits for events with timeouts
  - Handles restart metrics (duration, attempt count, first result time)
  - Logs detailed restart lifecycle

#### 5. **Lifecycle Control**
- **start()**: Begin listening with proper initialization
- **stop()**: Gracefully stop listening and log mic time
- **destroy()**: Clean up event listeners and resources

#### 6. **Mic Timing**
- **startMicTimer()**: Track total microphone-on time (100ms polling)
- **stopMicTimer()**: Stop timing and report elapsed time
- Triggers auto-restart when duration threshold reached
- Emits mic time updates via callback

#### 7. **Event Handling**
- **resultHandler**: Processes speech recognition results (interim & final)
  - Collapses repeats
  - Tracks first result after restart
  - Emits transcript updates
  - Handles VAD callback signals (onSpeechStart/onSpeechEnd)

- **errorHandler**: Handles recognition errors
  - Auto-recovery for common errors (no-speech, audio-capture, network)
  - Detailed error logging

- **endHandler**: Manages recognition termination
  - Auto-resumes recognition if still listening
  - Handles session end logic

- **startHandler**: Confirms recognition start
  - Tracks restart timing metrics
  - Logs start events

#### 8. **Callback Integration**
- `setWordsUpdateCallback()`: Words array updates
- `setMicTimeUpdateCallback()`: Mic time tracking
- `setRestartMetricsCallback()`: Restart statistics
- `setVadCallbacks()`: Speech start/end signals from VAD

#### 9. **Helper Utilities**
- **waitForEventOnce()**: Promise-based event waiting with timeouts
- **collapseRepeats()**: Multi-level repeat removal (word, block, sequence-based)
- **getSuffixToAppend()**: Smart text merging with overlap detection
- **getSessionDurationMs()**: Query session duration
- **isInAutoRestart()**: Check restart status

#### 10. **Event Management**
- **signalSpeechStart()**: Trigger VAD start callback
- **signalSpeechEnd()**: Trigger VAD end callback

### 🔧 Technical Details

**Collapse Repeats Algorithm**:
- Level 1: Period detection using KMP algorithm
- Level 2: Block-based repeat removal (up to 20 blocks)
- Level 3: Adjacent word duplicate removal

**Auto-Restart Timing**:
- Tracks multiple metrics per restart session:
  - `requestedAt`: When restart was initiated
  - `stopAt`: When recognition stopped
  - `startAttemptAt`: When restart was attempted
  - `startedAt`: When recognition restarted
  - `firstResultAt`: When first result came back

**Error Recovery**:
- Handles common speech recognition errors gracefully
- Auto-recovery for transient failures
- Proper logging for debugging

### 📊 State Management

**Total Properties**: 35+
- 3 callbacks (onLog, onTranscript, handlers)
- 5 callback functions (words, mic time, restart metrics, VAD callbacks)
- 27 internal state variables (transcript buffers, timers, metrics, flags)

### 🎯 Use Cases

1. **Speech Input with Auto-Restart**: Continuous speech recognition with automatic restart every 30 seconds
2. **Transcript Buffering**: Accumulates both interim and final results
3. **Restart Metrics**: Track how often restarts happen and their duration
4. **VAD Integration**: Signals speech boundaries for external VAD systems
5. **Mic Time Tracking**: Monitor total microphone-on time

### ✨ Key Improvements Over Placeholder

- Complete event lifecycle management (result, error, end, start)
- Robust timeout handling with promise-based wait mechanism
- Detailed logging for debugging and monitoring
- Proper resource cleanup in destroy()
- Auto-recovery from transient speech recognition errors
- Multi-level transcript repeat collapsing
- Smart overlap detection in text merging

### 📝 Build Status

✅ **No TypeScript errors**
✅ **All methods fully implemented**
✅ **Ready for compilation and usage**

Run the following to build:
```bash
cd stt-tts-lib
npm install
npm run build
```

This will generate:
- `dist/index.js` / `dist/index.mjs` - Full library bundle
- `dist/index.d.ts` - TypeScript declarations
- `dist/stt.js` / `dist/stt.mjs` - STT-only exports
- `dist/tts.js` / `dist/tts.mjs` - TTS-only exports
