import { ResetSTTLogic, STTLogic, VADController } from "../dist/stt/index.js";

const vad = new VADController({
  activation: -35,
  release: -45,
  hangoverFrames: 3,
  smoothingWindow: 4,
});

const resetLogic = new ResetSTTLogic({
  maxSilenceMs: 1200,
  maxUtteranceMs: 7000,
  onReset: (reason, stats) => {
    console.log(`Reset (${reason})`, stats);
  },
});

const frameEnergies = [-60, -55, -48, -38, -32, -30, -35, -40, -50, -60];
let timestamp = Date.now();

for (const energy of frameEnergies) {
  timestamp += 200;
  const { state, changed, energy: smoothed } = vad.handleFrame(energy, timestamp);

  if (state === "speech") {
    resetLogic.recordSpeechActivity(timestamp);
    resetLogic.updatePartialTranscript(`partial at ${timestamp}`);
  }

  if (changed) {
    console.log(`VAD -> ${state} (smoothed ${smoothed.toFixed(1)} dBFS)`);
  }

  resetLogic.maybeReset(timestamp);
}

resetLogic.forceReset("manual");

// STTLogic session wrapper demo
const stt = new STTLogic({ sessionDurationMs: 15000 });
stt.setWordsUpdateCallback((finalText, interim) => {
  console.log("final:", finalText, "interim:", interim);
});
stt.start();
stt.updateInterim("hello wor");
stt.updateInterim("hello world");
stt.pushFinal("hello world");
stt.stop();
