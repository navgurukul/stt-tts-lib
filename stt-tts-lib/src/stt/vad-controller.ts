export type VADState = "silence" | "speech";

export interface VADOptions {
  /** dBFS threshold that marks activation into speech. */
  activation: number;
  /** dBFS threshold that marks release back to silence. */
  release: number;
  /** Number of frames to wait before flipping back to silence. */
  hangoverFrames?: number;
  /** Window size for smoothing energy measurements. */
  smoothingWindow?: number;
  /** Optional clock override. */
  now?: () => number;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
}

export interface VADDecision {
  state: VADState;
  changed: boolean;
  timestamp: number;
  energy: number;
}

/**
 * Lightweight VAD state machine that operates on pre-computed frame energies (e.g., dBFS).
 */
export class VADController {
  private readonly activation: number;
  private readonly release: number;
  private readonly hangoverFrames: number;
  private readonly smoothingWindow: number;
  private readonly now: () => number;
  private readonly onSpeechStart?: () => void;
  private readonly onSpeechEnd?: () => void;

  private active = false;
  private state: VADState = "silence";
  private hangover = 0;
  private energyWindow: number[] = [];

  constructor(options: VADOptions) {
    this.activation = options.activation;
    this.release = options.release;
    this.hangoverFrames = options.hangoverFrames ?? 5;
    this.smoothingWindow = options.smoothingWindow ?? 4;
    this.now = options.now ?? (() => Date.now());
    this.onSpeechStart = options.onSpeechStart;
    this.onSpeechEnd = options.onSpeechEnd;
  }

  getState(): VADState {
    return this.state;
  }

  start(): void {
    this.active = true;
    this.resetState();
  }

  stop(): void {
    this.active = false;
    this.resetState();
  }

  /**
   * Push a new frame energy (dBFS). Returns the current state and whether it changed.
   */
  handleFrame(energy: number, timestamp?: number): VADDecision {
    if (!this.active) {
      return { state: this.state, changed: false, timestamp: timestamp ?? this.now(), energy };
    }

    const ts = timestamp ?? this.now();
    this.energyWindow.push(energy);
    if (this.energyWindow.length > this.smoothingWindow) {
      this.energyWindow.shift();
    }

    const smoothed =
      this.energyWindow.reduce((acc, val) => acc + val, 0) / this.energyWindow.length;

    let changed = false;

    if (this.state === "silence" && smoothed >= this.activation) {
      this.state = "speech";
      this.hangover = 0;
      changed = true;
      this.onSpeechStart?.();
    } else if (this.state === "speech") {
      if (smoothed >= this.release) {
        this.hangover = 0;
      } else {
        this.hangover += 1;
        if (this.hangover >= this.hangoverFrames) {
          this.state = "silence";
          this.hangover = 0;
          changed = true;
          this.onSpeechEnd?.();
        }
      }
    }

    return { state: this.state, changed, timestamp: ts, energy: smoothed };
  }

  private resetState(): void {
    this.state = "silence";
    this.hangover = 0;
    this.energyWindow = [];
  }
}
