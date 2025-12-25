export type ResetReason = "silence" | "utterance-complete" | "manual";

export interface ResetStats {
  utteranceStartedAt: number;
  lastActivityAt: number;
  partialTranscript: string;
}

export interface ResetSTTOptions {
  /** Maximum silence (ms) allowed before forcing a reset. */
  maxSilenceMs?: number;
  /** Maximum utterance length (ms) before rotating to a fresh buffer. */
  maxUtteranceMs?: number;
  /** Optional reset hook for logging/analytics. */
  onReset?: (reason: ResetReason, stats: ResetStats) => void;
  /**
   * Supply a clock for deterministic tests; defaults to Date.now.
   * Using a function keeps the class platform-neutral.
   */
  now?: () => number;
}

/**
 * Tracks speech activity and decides when to reset an STT pipeline so tokens and streams do not grow unbounded.
 */
export class ResetSTTLogic {
  private readonly maxSilenceMs: number;
  private readonly maxUtteranceMs: number;
  private readonly onReset?: (reason: ResetReason, stats: ResetStats) => void;
  private readonly now: () => number;

  private utteranceStartedAt: number;
  private lastActivityAt: number;
  private partialTranscript = "";

  constructor(options: ResetSTTOptions = {}) {
    this.maxSilenceMs = options.maxSilenceMs ?? 2000;
    this.maxUtteranceMs = options.maxUtteranceMs ?? 15000;
    this.onReset = options.onReset;
    this.now = options.now ?? (() => Date.now());

    const start = this.now();
    this.utteranceStartedAt = start;
    this.lastActivityAt = start;
  }

  recordSpeechActivity(timestamp?: number): void {
    const now = timestamp ?? this.now();
    this.lastActivityAt = now;
    if (!this.utteranceStartedAt) {
      this.utteranceStartedAt = now;
    }
  }

  updatePartialTranscript(partial: string, timestamp?: number): void {
    this.partialTranscript = partial;
    this.recordSpeechActivity(timestamp);
  }

  shouldReset(timestamp?: number): ResetReason | null {
    const now = timestamp ?? this.now();
    const silenceElapsed = now - this.lastActivityAt;
    const utteranceElapsed = now - this.utteranceStartedAt;

    if (silenceElapsed >= this.maxSilenceMs) {
      return "silence";
    }

    if (utteranceElapsed >= this.maxUtteranceMs) {
      return "utterance-complete";
    }

    return null;
  }

  maybeReset(timestamp?: number): ResetReason | null {
    const reason = this.shouldReset(timestamp);
    if (reason) {
      this.reset(reason, timestamp);
    }
    return reason;
  }

  forceReset(reason: ResetReason = "manual", timestamp?: number): void {
    this.reset(reason, timestamp);
  }

  private reset(reason: ResetReason, timestamp?: number): void {
    const now = timestamp ?? this.now();
    const stats: ResetStats = {
      utteranceStartedAt: this.utteranceStartedAt,
      lastActivityAt: this.lastActivityAt,
      partialTranscript: this.partialTranscript,
    };

    this.utteranceStartedAt = now;
    this.lastActivityAt = now;
    this.partialTranscript = "";

    if (this.onReset) {
      this.onReset(reason, stats);
    }
  }
}
