/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { internalSpeechState } from "../internal/speech-state";
import { FillerManager, FillerConfig } from "../tts/filler-manager";

// Public callback/type aliases kept for backward compatibility with STTLogic API
export type WordUpdateCallback = (words: string[]) => void;
export type MicTimeUpdateCallback = (ms: number) => void;
export type RestartMetricsCallback = (
  count: number,
  lastDuration: number | null
) => void;
export type VadCallbacks = {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
};

type LogCallback = (
  message: string,
  type?: "info" | "error" | "warning"
) => void;
type TranscriptCallback = (transcript: string) => void;

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

export interface ResetSTTOptions {
  sessionDurationMs?: number;
  interimSaveIntervalMs?: number;
  preserveTranscriptOnStart?: boolean;

  // Filler word configuration
  /** Enable short filler (default: false) */
  enableShortFiller?: boolean;
  /** Enable long filler (default: false) */
  enableLongFiller?: boolean;
  /** Delay before short filler in ms (default: 5000) */
  shortFillerDelayMs?: number;
  /** Delay before long filler in ms (default: 10000) */
  longFillerDelayMs?: number;
  /** Fallback short filler if LLM fails */
  shortFillerFallback?: string;
  /** Fallback long filler if LLM fails */
  longFillerFallback?: string;
  /** Callback when filler is generated */
  onFillerGenerated?: (type: "short" | "long", text: string) => void;

  // LLM Configuration for dynamic fillers
  /** LLM API URL (required for dynamic filler generation) */
  llmApiUrl?: string;
  /** LLM API Key */
  llmApiKey?: string;
  /** LLM Model name (default: "deepseek-chat") */
  llmModel?: string;
  /** LLM request timeout in ms (default: 3000) */
  llmTimeoutMs?: number;
  /** Language hint for LLM (e.g., "English", "Hindi") */
  languageHint?: string;
}

// Alias to match previous public surface
export type STTLogicOptions = ResetSTTOptions;

export class ResetSTTLogic {
  private recognition: any;
  private isListening: boolean = false;
  private fullTranscript: string = "";
  private heardWords: string[] = [];
  private onLog: LogCallback;
  private onTranscript: TranscriptCallback;
  private onWordsUpdate: WordUpdateCallback | null = null;
  private onMicTimeUpdate: MicTimeUpdateCallback | null = null;
  private onRestartMetrics: RestartMetricsCallback | null = null;
  private options: {
    sessionDurationMs: number;
    interimSaveIntervalMs: number;
    preserveTranscriptOnStart: boolean;
  };

  private micOnTime: number = 0;
  private sessionDuration: number = 30000;
  private lastTickTime: number = 0;
  private micTimeInterval: number | null = null;
  private restartCount: number = 0;
  private isRestarting: boolean = false;
  private isRecognitionRunning: boolean = false;
  private lastInterimTranscript: string = "";
  private lastInterimSaveTime: number = 0;
  private interimSaveInterval: number = 1000;
  private lastInterimResultTime: number = 0;
  private lastSavedLength: number = 0;
  private transcriptBeforeRestart: string = "";
  private sessionStartTranscript: string = "";
  private resultHandler?: (e: Event) => void;
  private errorHandler?: (e: Event) => void;
  private endHandler?: (e?: Event) => void;
  private startHandler?: (e?: Event) => void;
  private sessionId: number = 0;
  private awaitingRestartFirstResultId: number | null = null;
  private lastWasFinal: boolean = false;
  private restartMetrics: Record<
    number,
    {
      requestedAt: number;
      stopAt?: number;
      startAttemptAt?: number;
      startedAt?: number;
      firstResultAt?: number;
    }
  > = {};
  private isAutoRestarting: boolean = false;
  private onUserSpeechStart?: () => void;
  private onUserSpeechEnd?: () => void;
  private fillerManager: FillerManager | null = null;

  constructor(
    onLog: LogCallback,
    onTranscript: TranscriptCallback,
    options: ResetSTTOptions = {}
  ) {
    this.onLog = onLog;
    this.onTranscript = onTranscript;
    this.options = {
      sessionDurationMs: options.sessionDurationMs ?? 30000,
      interimSaveIntervalMs: options.interimSaveIntervalMs ?? 5000,
      preserveTranscriptOnStart: options.preserveTranscriptOnStart ?? false,
    };
    this.sessionDuration = this.options.sessionDurationMs;
    this.interimSaveInterval = this.options.interimSaveIntervalMs;

    // Initialize filler manager if any filler is enabled
    if (options.enableShortFiller || options.enableLongFiller) {
      this.fillerManager = new FillerManager({
        enableShortFiller: options.enableShortFiller,
        enableLongFiller: options.enableLongFiller,
        shortFillerDelayMs: options.shortFillerDelayMs,
        longFillerDelayMs: options.longFillerDelayMs,
        shortFillerFallback: options.shortFillerFallback,
        longFillerFallback: options.longFillerFallback,
        // LLM configuration for dynamic filler generation
        llmApiUrl: options.llmApiUrl,
        llmApiKey: options.llmApiKey,
        llmModel: options.llmModel,
        llmTimeoutMs: options.llmTimeoutMs,
        languageHint: options.languageHint,
        onFillerGenerated: options.onFillerGenerated,
      });
      this.onLog(
        `[STTLogic] Filler manager initialized (short: ${
          options.enableShortFiller
        }, long: ${options.enableLongFiller}, LLM: ${
          options.llmApiUrl ? "configured" : "disabled"
        })`,
        "info"
      );
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      this.onLog("Speech Recognition API not supported", "error");
      throw new Error("Speech Recognition API not available");
    }

    this.recognition = new SpeechRecognitionAPI();
    this.setupRecognition();
  }

  public setWordsUpdateCallback(callback: WordUpdateCallback): void {
    this.onWordsUpdate = callback;
  }

  public setMicTimeUpdateCallback(callback: MicTimeUpdateCallback): void {
    this.onMicTimeUpdate = callback;
  }

  public setRestartMetricsCallback(callback: RestartMetricsCallback): void {
    this.onRestartMetrics = callback;
  }

  public setVadCallbacks(
    onSpeechStart?: () => void,
    onSpeechEnd?: () => void
  ): void {
    this.onUserSpeechStart = onSpeechStart || undefined;
    this.onUserSpeechEnd = onSpeechEnd || undefined;
  }

  public getSessionDurationMs(): number {
    return this.sessionDuration;
  }

  public isInAutoRestart(): boolean {
    return this.isAutoRestarting;
  }

  public getFullTranscript(): string {
    if (this.transcriptBeforeRestart.length > 0) {
      if (this.fullTranscript.length > 0) {
        return (
          this.transcriptBeforeRestart +
          " " +
          this.fullTranscript
        ).trim();
      }
      return this.transcriptBeforeRestart;
    }
    return this.fullTranscript;
  }

  public clearTranscript(): void {
    this.fullTranscript = "";
    this.transcriptBeforeRestart = "";
    this.sessionStartTranscript = "";
    this.heardWords = [];
  }

  private setupRecognition(): void {
    this.recognition.lang = "en-US";
    this.recognition.interimResults = true;
    this.recognition.continuous = true;
    (this.recognition as any).maxAlternatives = 1;

    this.resultHandler = (event: Event) => {
      const speechEvent = event as SpeechRecognitionEvent;
      let completeTranscript = "";
      for (let i = 0; i < speechEvent.results.length; i++) {
        completeTranscript += speechEvent.results[i][0].transcript + " ";
      }
      completeTranscript = completeTranscript.trim();

      const isFinal =
        speechEvent.results[speechEvent.results.length - 1].isFinal;

      completeTranscript = this.collapseRepeats(completeTranscript);
      this.lastInterimTranscript = completeTranscript;
      this.lastInterimResultTime = Date.now();

      // Update filler manager with current partial transcript
      if (this.fillerManager && !isFinal) {
        this.fillerManager.updatePartialTranscript(completeTranscript);
      }

      if (this.awaitingRestartFirstResultId != null) {
        const rid = this.awaitingRestartFirstResultId;
        if (
          this.restartMetrics[rid] &&
          !this.restartMetrics[rid].firstResultAt
        ) {
          this.restartMetrics[rid].firstResultAt = Date.now();
          const delta =
            this.restartMetrics[rid].firstResultAt -
            this.restartMetrics[rid].requestedAt;
          this.onLog(
            `🔔 First result after restart #${rid} in ${delta}ms`,
            "info"
          );
          this.awaitingRestartFirstResultId = null;
        }
      }
      this.onLog(
        `[${isFinal ? "FINAL" : "INTERIM"}] "${completeTranscript}"`,
        isFinal ? "info" : "warning"
      );

      if (!isFinal && this.lastWasFinal) {
        // User started speaking - notify internal speech state
        internalSpeechState.setSpeaking(true);
        try {
          this.onUserSpeechStart?.();
        } catch {}
      }

      this.lastWasFinal = isFinal;

      if (isFinal) {
        // User stopped speaking - notify internal speech state
        internalSpeechState.setSpeaking(false);
        try {
          this.onUserSpeechEnd?.();
        } catch {}

        this.fullTranscript = (
          this.sessionStartTranscript +
          " " +
          completeTranscript
        ).trim();
        this.fullTranscript = this.collapseRepeats(this.fullTranscript);

        this.heardWords = this.fullTranscript
          .split(/\s+/)
          .filter((word) => word.length > 0);

        this.onTranscript(this.getFullTranscript());
        this.lastSavedLength = this.fullTranscript.length;
        if (this.onWordsUpdate) this.onWordsUpdate(this.heardWords);

        this.lastInterimTranscript = "";

        if (this.awaitingRestartFirstResultId != null) {
          const rid = this.awaitingRestartFirstResultId;
          if (
            this.restartMetrics[rid] &&
            !this.restartMetrics[rid].firstResultAt
          ) {
            this.restartMetrics[rid].firstResultAt = Date.now();
            const startedAt =
              this.restartMetrics[rid].startedAt ||
              this.restartMetrics[rid].startAttemptAt ||
              Date.now();
            const firstResultDelta =
              this.restartMetrics[rid].firstResultAt -
              this.restartMetrics[rid].requestedAt;
            this.onLog(
              `🔔 First result after restart #${rid} in ${firstResultDelta}ms`,
              "info"
            );
            this.awaitingRestartFirstResultId = null;
          }
        }
      }
    };
    this.recognition.addEventListener("result", this.resultHandler);

    this.errorHandler = (event: Event) => {
      const errorEvent = event as SpeechRecognitionErrorEvent;
      if (errorEvent.error === "aborted" && this.isRestarting) {
        this.onLog("Aborted during restart (ignored)", "info");
        this.isRecognitionRunning = false;
        return;
      }
      this.onLog(`Error: ${errorEvent.error}`, "error");
      if (
        errorEvent.error === "no-speech" ||
        errorEvent.error === "audio-capture" ||
        errorEvent.error === "network"
      ) {
        setTimeout(() => {
          if (
            this.isListening &&
            !this.isRestarting &&
            !this.isRecognitionRunning
          ) {
            try {
              this.recognition.start();
              this.isRecognitionRunning = true;
              this.sessionId++;
            } catch (e) {
              this.onLog(`Failed restart after error: ${e}`, "error");
            }
          }
        }, 500);
      } else {
        this.onLog(
          `Unhandled SpeechRecognition error: ${errorEvent.error}`,
          "warning"
        );
      }
    };
    this.recognition.addEventListener("error", this.errorHandler);

    this.endHandler = () => {
      this.isRecognitionRunning = false;
      if (this.isListening && !this.isRestarting) {
        setTimeout(() => {
          if (this.isListening && !this.isRestarting) {
            try {
              this.recognition.start();
              this.isRecognitionRunning = true;
              this.sessionId++;
              this.onLog(
                `🔁 Auto-resumed recognition after end (session ${this.sessionId})`,
                "info"
              );
            } catch (e) {
              this.onLog(`Failed to auto-start after end: ${e}`, "error");
            }
          }
        }, 100);
      }
    };
    this.recognition.addEventListener("end", this.endHandler);

    this.startHandler = () => {
      this.isRecognitionRunning = true;
      const rid = this.awaitingRestartFirstResultId;
      if (rid != null && this.restartMetrics[rid]) {
        if (!this.restartMetrics[rid].startedAt) {
          this.restartMetrics[rid].startedAt = Date.now();
          this.onLog(
            `▶️ Restart #${rid} recognition started in ${
              this.restartMetrics[rid].startedAt -
              this.restartMetrics[rid].requestedAt
            }ms`,
            "info"
          );
        }
      }
    };
    this.recognition.addEventListener("start", this.startHandler);
  }

  private waitForEventOnce(
    eventName: string,
    timeoutMs: number
  ): Promise<Event | null> {
    return new Promise((resolve) => {
      let timer: number | null = null;
      const handler = (ev: Event) => {
        if (timer !== null) clearTimeout(timer);
        this.recognition.removeEventListener(eventName, handler);
        resolve(ev);
      };
      this.recognition.addEventListener(eventName, handler);
      timer = window.setTimeout(() => {
        this.recognition.removeEventListener(eventName, handler);
        resolve(null);
      }, timeoutMs);
    });
  }

  private startMicTimer(): void {
    this.lastTickTime = Date.now();
    this.lastInterimSaveTime = Date.now();

    this.micTimeInterval = window.setInterval(() => {
      if (this.isListening) {
        const now = Date.now();
        const elapsed = now - this.lastTickTime;
        this.micOnTime += elapsed;
        this.lastTickTime = now;

        if (now - this.lastInterimSaveTime >= this.interimSaveInterval) {
          this.saveInterimToFinal();
          this.lastInterimSaveTime = now;
        }

        if (this.micOnTime >= this.sessionDuration) {
          if (!this.isRestarting) this.performRestart();
        }
        if (this.onMicTimeUpdate) this.onMicTimeUpdate(this.micOnTime);
      }
    }, 100);
  }

  private stopMicTimer(): void {
    if (this.micTimeInterval) {
      clearInterval(this.micTimeInterval);
      this.micTimeInterval = null;
    }
  }

  private saveInterimToFinal(): void {
    if (!this.lastInterimTranscript) return;
    const now = Date.now();
    if (
      now - this.lastInterimResultTime > this.interimSaveInterval &&
      this.lastInterimTranscript.length > this.lastSavedLength
    ) {
      this.fullTranscript = (
        this.fullTranscript +
        " " +
        this.lastInterimTranscript
      ).trim();
      this.fullTranscript = this.collapseRepeats(this.fullTranscript);
      this.lastSavedLength = this.fullTranscript.length;
      if (this.onWordsUpdate) {
        const words = this.fullTranscript
          .split(/\s+/)
          .filter((w) => w.length > 0);
        this.onWordsUpdate(words);
      }
      this.onTranscript(this.getFullTranscript());
    }
  }

  private getSuffixToAppend(base: string, current: string): string {
    if (!base || base.length === 0) return current;
    if (!current || current.length === 0) return "";
    base = base.trim();
    current = current.trim();
    if (current.startsWith(base)) {
      return current.slice(base.length).trim();
    }
    const maxOverlap = Math.min(base.length, current.length);
    for (let overlap = maxOverlap; overlap > 0; overlap--) {
      if (base.endsWith(current.slice(0, overlap))) {
        return current.slice(overlap).trim();
      }
    }
    return current;
  }

  private collapseRepeats(text: string): string {
    if (!text || text.trim().length === 0) return text.trim();
    let normalized = text.replace(/\s+/g, " ").trim();
    const n = normalized.length;
    const lps: number[] = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      let j = lps[i - 1];
      while (j > 0 && normalized[i] !== normalized[j]) j = lps[j - 1];
      if (normalized[i] === normalized[j]) j++;
      lps[i] = j;
    }
    const period = n - lps[n - 1];
    if (period < n && n % period === 0) {
      return normalized.slice(0, period).trim();
    }
    const words = normalized.split(" ");
    for (
      let block = Math.min(20, Math.floor(words.length / 2));
      block >= 1;
      block--
    ) {
      let i = 0;
      while (i + 2 * block <= words.length) {
        let blockA = words.slice(i, i + block).join(" ");
        let blockB = words.slice(i + block, i + 2 * block).join(" ");
        if (blockA === blockB) {
          words.splice(i + block, block);
        } else {
          i++;
        }
      }
    }
    const collapsedWords: string[] = [];
    for (const w of words) {
      if (
        collapsedWords.length === 0 ||
        collapsedWords[collapsedWords.length - 1] !== w
      )
        collapsedWords.push(w);
    }
    return collapsedWords.join(" ").trim();
  }

  private performRestart(): void {
    if (!this.isListening || this.isRestarting) return;

    const restartStartTime = Date.now();
    this.restartCount++;
    this.isRestarting = true;
    this.isAutoRestarting = true;
    const rid = ++this.sessionId;
    this.awaitingRestartFirstResultId = rid;
    this.restartMetrics[rid] = { requestedAt: restartStartTime };

    this.onLog(
      `🔄 [AUTO-RESTART] Session ${rid} - buffering transcript, waiting for silence...`,
      "warning"
    );

    if (this.lastInterimTranscript.trim().length > 0) {
      this.saveInterimToFinal();
    }

    this.transcriptBeforeRestart = this.getFullTranscript();
    this.fullTranscript = "";
    this.sessionStartTranscript = "";
    this.lastInterimTranscript = "";
    this.heardWords = [];

    this.stopMicTimer();

    const stopTimeout = 600;
    const startTimeout = 1000;
    const firstResultTimeout = 2000;

    const stopNow = async () => {
      try {
        if (this.isRecognitionRunning) {
          this.recognition.stop();
        } else {
          this.onLog("Recognition not running at stop attempt", "warning");
        }
      } catch (err) {
        this.onLog(`Stop threw: ${err}`, "warning");
      }
      const endEvent = await this.waitForEventOnce("end", stopTimeout);
      if (!endEvent) {
        try {
          (this.recognition as any).abort();
        } catch (err) {
          this.onLog(`Abort also failed: ${err}`, "error");
        }
        await this.waitForEventOnce("end", 300);
      }
      this.restartMetrics[rid].stopAt = Date.now();
    };

    (async () => {
      await stopNow();
      this.restartMetrics[rid].startAttemptAt = Date.now();
      try {
        if (!this.isRecognitionRunning) {
          this.sessionId = rid;
          this.recognition.start();
        } else {
          this.onLog(
            "Recognition already running at restart time; skipping start.",
            "warning"
          );
        }
      } catch (e) {
        this.onLog(`Failed to start recognition after restart: ${e}`, "error");
      }

      const startEv = await this.waitForEventOnce("start", startTimeout);
      if (startEv) {
        this.restartMetrics[rid].startedAt = Date.now();
      } else {
        this.onLog(
          `Restart #${rid} did not produce start event within ${startTimeout}ms`,
          "warning"
        );
      }

      const resEv = await this.waitForEventOnce("result", firstResultTimeout);
      if (resEv) {
        if (this.restartMetrics[rid])
          this.restartMetrics[rid].firstResultAt = Date.now();
        const firstResultDelta =
          (this.restartMetrics[rid].firstResultAt || Date.now()) -
          (this.restartMetrics[rid].requestedAt || Date.now());
        this.onLog(
          `🔔 First result after restart #${rid} in ${firstResultDelta}ms`,
          "info"
        );
      } else {
        this.onLog(
          `Restart #${rid} produced no result within ${firstResultTimeout}ms`,
          "warning"
        );
      }

      const startedAt =
        this.restartMetrics[rid].startedAt ||
        this.restartMetrics[rid].startAttemptAt ||
        Date.now();
      const restartDuration = startedAt - this.restartMetrics[rid].requestedAt;
      if (this.onRestartMetrics)
        this.onRestartMetrics(this.restartCount, restartDuration);
      this.onLog(
        `✅ Session ${rid} restarted in ${restartDuration}ms - resuming from silence gate`,
        "info"
      );
      this.startMicTimer();
      this.isRestarting = false;
      this.isAutoRestarting = false;
    })();
  }

  public start(): void {
    if (this.isListening) return;

    try {
      this.isListening = true;
      if (!this.options.preserveTranscriptOnStart) {
        this.fullTranscript = "";
        this.heardWords = [];
        this.transcriptBeforeRestart = "";
        this.sessionStartTranscript = "";
      } else {
        this.sessionStartTranscript = this.fullTranscript;
      }

      this.micOnTime = 0;
      this.restartCount = 0;
      this.lastSavedLength = 0;
      this.lastInterimTranscript = "";
      this.lastWasFinal = false;

      if (!this.isRecognitionRunning) {
        this.sessionId++;
        this.recognition.start();
        this.isRecognitionRunning = true;
      }
      this.startMicTimer();
      this.onLog(
        "Listening started (auto-restart every 30s of mic time)",
        "info"
      );
    } catch (error) {
      this.isListening = false;
      this.onLog(`Failed to start: ${error}`, "error");
    }
  }

  public stop(): void {
    if (!this.isListening) return;

    try {
      this.isListening = false;
      this.isAutoRestarting = false;
      this.stopMicTimer();
      this.recognition.stop();
      this.isRecognitionRunning = false;
      this.onLog(
        `Stopped listening (total mic time: ${(this.micOnTime / 1000).toFixed(
          1
        )}s, restarts: ${this.restartCount})`,
        "info"
      );
    } catch (error) {
      this.onLog(`Failed to stop: ${error}`, "error");
    }
  }

  public destroy(): void {
    this.isListening = false;
    this.stopMicTimer();

    // Cleanup filler manager
    if (this.fillerManager) {
      this.fillerManager.destroy();
      this.fillerManager = null;
    }

    try {
      (this.recognition as any).abort?.();
    } catch (e) {}
    try {
      if (this.resultHandler)
        this.recognition.removeEventListener("result", this.resultHandler);
      if (this.errorHandler)
        this.recognition.removeEventListener("error", this.errorHandler);
      if (this.endHandler)
        this.recognition.removeEventListener(
          "end",
          this.endHandler as EventListener
        );
      if (this.startHandler)
        this.recognition.removeEventListener(
          "start",
          this.startHandler as EventListener
        );
    } catch (e) {}
  }

  // ==========================================================================
  // Filler Manager Methods
  // ==========================================================================

  /**
   * Get the filler manager instance (if enabled)
   */
  getFillerManager(): FillerManager | null {
    return this.fillerManager;
  }

  /**
   * Set a custom synthesizer for filler audio generation.
   * Optional - internal TTS is used by default.
   */
  setFillerSynthesizer(
    synthesize: (
      text: string
    ) => Promise<{ audio: Float32Array; sampleRate: number }>
  ): void {
    if (this.fillerManager) {
      this.fillerManager.setSynthesizer(synthesize);
      this.onLog("[STTLogic] Custom filler synthesizer configured", "info");
    }
  }

  /**
   * Get the generated short filler text (null if not generated yet)
   */
  getShortFiller(): string | null {
    return this.fillerManager?.shortFiller ?? null;
  }

  /**
   * Get the generated long filler text (null if not generated yet)
   */
  getLongFiller(): string | null {
    return this.fillerManager?.longFiller ?? null;
  }
}

// Backward-compatible alias so consumers can import STTLogic as before
export class STTLogic extends ResetSTTLogic {}
