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

  /**
   * Called on every interim (non-final) recognition result with the current
   * partial transcript text. Useful for real‑time UI updates.
   * Does not affect the final transcript or setWordsUpdateCallback.
   */
  onInterimTranscript?: (text: string) => void;
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
  private onInterimTranscriptCallback?: (text: string) => void;
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
  private isMobile: boolean = false;
  private speechEndHandler?: (e?: Event) => void;
  private audioEndHandler?: (e?: Event) => void;
  private lastSpeechEndTime: number = 0;

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
    this.onInterimTranscriptCallback = options.onInterimTranscript;

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
    this.isMobile = this.detectMobile();
    if (this.isMobile) {
      this.sessionDuration = Math.min(this.sessionDuration, 10000);
    }
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

  /**
   * Detect if running on a mobile device.
   * More accurate detection that avoids false positives on laptops with touchscreens.
   */
  private detectMobile(): boolean {
    const userAgent =
      navigator.userAgent || navigator.vendor || (window as any).opera;
    const ua = userAgent.toLowerCase();

    // Check for explicit mobile patterns in user agent
    const isMobileUA =
      /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua);

    // iPad detection (iPadOS 13+ reports as Mac in UA, but has touch)
    const isIPad =
      /ipad/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    // Exclude desktop browsers that happen to have touch (Windows laptops, MacBooks with touch bar)
    const isDesktopWithTouch =
      /windows nt|macintosh|mac os x/i.test(ua) && !isMobileUA && !isIPad;

    const result = (isMobileUA || isIPad) && !isDesktopWithTouch;

    console.log(
      `[ResetSTTLogic] Mobile detection: ${result} (UA: ${ua.substring(0, 50)}...)`
    );

    return result;
  }

  private setupRecognition(): void {
    this.recognition.lang = "en-US";
    this.recognition.interimResults = true;
    this.recognition.continuous = true;
    (this.recognition as any).maxAlternatives = 1;

    this.resultHandler = (event: Event) => {
      const speechEvent = event as SpeechRecognitionEvent;

      // Build complete transcript more carefully to avoid duplicates
      let completeTranscript = "";
      const finalizedParts: string[] = [];
      let currentInterim = "";

      for (let i = 0; i < speechEvent.results.length; i++) {
        const result = speechEvent.results[i];
        const transcript = result[0].transcript.trim();

        if (result.isFinal) {
          // For final results, add to finalized parts (avoiding duplicates)
          if (
            transcript.length > 0 &&
            !this.isDuplicateOfPrevious(finalizedParts, transcript)
          ) {
            finalizedParts.push(transcript);
          }
        } else {
          // For interim results, only keep the last one (most complete)
          currentInterim = transcript;
        }
      }

      // Combine finalized parts
      completeTranscript = finalizedParts.join(" ");

      // Add interim if present and not duplicate of finalized content
      if (currentInterim.length > 0) {
        if (completeTranscript.length > 0) {
          const suffix = this.getSuffixToAppend(completeTranscript, currentInterim);
          if (suffix.length > 0) {
            completeTranscript = completeTranscript + " " + suffix;
          }
        } else {
          completeTranscript = currentInterim;
        }
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

      if (!isFinal && this.onInterimTranscriptCallback) {
        this.onInterimTranscriptCallback(completeTranscript);
      }

      if (isFinal) {
        // User stopped speaking - notify internal speech state
        internalSpeechState.setSpeaking(false);
        try {
          this.onUserSpeechEnd?.();
        } catch {}

        const suffix = this.getSuffixToAppend(
          this.fullTranscript,
          completeTranscript
        );
        if (suffix.length > 0) {
          this.fullTranscript = (this.fullTranscript + " " + suffix).trim();
          this.fullTranscript = this.collapseRepeats(this.fullTranscript);
          this.heardWords = this.fullTranscript
            .split(/\s+/)
            .filter((word) => word.length > 0);
          this.onTranscript(this.fullTranscript);
          this.lastSavedLength = this.fullTranscript.length;
          if (this.onWordsUpdate) this.onWordsUpdate(this.heardWords);
        }

        this.lastInterimTranscript = "";

        if (this.awaitingRestartFirstResultId != null) {
          const rid = this.awaitingRestartFirstResultId;
          if (
            this.restartMetrics[rid] &&
            !this.restartMetrics[rid].firstResultAt
          ) {
            this.restartMetrics[rid].firstResultAt = Date.now();
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

      const timeSinceLastResult = Date.now() - this.lastInterimResultTime;
      const hadRecentSpeech = timeSinceLastResult < 2000; // Had speech within last 2s

      console.log(
        `[ResetSTTLogic] Recognition ended. isListening: ${this.isListening}, ` +
        `isRestarting: ${this.isRestarting}, isMobile: ${this.isMobile}, ` +
        `timeSinceLastResult: ${timeSinceLastResult}ms`
      );

      if (this.isListening && !this.isRestarting) {
        // Save any pending interim transcript before restart
        if (this.lastInterimTranscript.trim().length > 0) {
          this.saveInterimToFinal();
        }

        // On mobile, be conservative with restarts to avoid loops.
        // Only restart if we had recent speech OR it's been a while since last result.
        const shouldRestart = this.isMobile
          ? hadRecentSpeech || timeSinceLastResult > 3000
          : true; // Desktop: always restart quickly

        if (shouldRestart) {
          const restartDelay = this.isMobile ? 300 : 100;
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
                console.log(
                  `[ResetSTTLogic] Recognition restarted (session ${this.sessionId}, ` +
                  `timeSinceLastResult: ${timeSinceLastResult}ms, mobile: ${this.isMobile})`
                );
                this.onLog(
                  `🔁 Auto-resumed recognition after end (session ${this.sessionId})`,
                  "info"
                );
              } catch (e) {
                this.onLog(`Failed to auto-start after end: ${e}`, "error");
              }
            }
          }, restartDelay);
        } else {
          console.log(
            `[ResetSTTLogic] Mobile: Skipping restart ` +
            `(timeSinceLastResult: ${timeSinceLastResult}ms, hadRecentSpeech: ${hadRecentSpeech})`
          );
        }
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

    // speechend fires when silence is detected after speech
    this.speechEndHandler = () => {
      this.lastSpeechEndTime = Date.now();
      console.log(
        `[ResetSTTLogic] Speech ended (silence detected) - mobile: ${this.isMobile}`
      );
    };
    this.recognition.addEventListener("speechend", this.speechEndHandler);

    // audioend fires when audio capture ends (before onend)
    this.audioEndHandler = () => {
      if (this.isListening && !this.isRestarting) {
        // On mobile, be conservative - only save if we haven't saved recently
        const timeSinceLastSave = Date.now() - this.lastInterimSaveTime;
        const shouldSave = this.isMobile
          ? timeSinceLastSave > 1000
          : true;

        if (shouldSave && this.lastInterimTranscript.trim().length > 0) {
          this.saveInterimToFinal();
          console.log(
            `[ResetSTTLogic] Audio ended - saved interim transcript (mobile: ${this.isMobile})`
          );
        }
      }
    };
    this.recognition.addEventListener("audioend", this.audioEndHandler);
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

    // Track mic on-time every 100ms (for UI only, no forced restarts)
    this.micTimeInterval = window.setInterval(() => {
      if (this.isListening) {
        const now = Date.now();
        const elapsed = now - this.lastTickTime;
        this.micOnTime += elapsed;
        this.lastTickTime = now;

        // NO forced timer-based restarts - let recognition run naturally with continuous=true
        // Restart only via onend handler when browser stops recognition

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
    if (!this.lastInterimTranscript.trim()) return;

    const base =
      this.transcriptBeforeRestart.trim().length > 0
        ? this.transcriptBeforeRestart
        : this.fullTranscript;

    const newTranscript = this.collapseRepeats(this.lastInterimTranscript.trim());
    const suffix = this.getSuffixToAppend(base, newTranscript);
    if (suffix.length > 0) {
      this.fullTranscript = (base + " " + suffix).trim();
      this.fullTranscript = this.collapseRepeats(this.fullTranscript);
      if (this.transcriptBeforeRestart.trim().length > 0) {
        this.transcriptBeforeRestart = "";
      }
      this.heardWords = this.fullTranscript
        .split(/\s+/)
        .filter((word) => word.length > 0);
      this.onTranscript(this.fullTranscript);
      this.lastSavedLength = this.fullTranscript.length;
      this.lastInterimTranscript = "";
      this.lastInterimSaveTime = Date.now();
      if (this.onWordsUpdate) this.onWordsUpdate(this.heardWords);
    }
  }

  /**
   * Check if a transcript is a duplicate or subset of previous finalized parts.
   */
  private isDuplicateOfPrevious(parts: string[], newPart: string): boolean {
    if (parts.length === 0) return false;

    const newPartNormalized = newPart.toLowerCase().trim();

    for (const part of parts) {
      const partNormalized = part.toLowerCase().trim();
      // Exact match
      if (partNormalized === newPartNormalized) return true;
      // New part is contained in existing part
      if (partNormalized.includes(newPartNormalized)) return true;
    }

    // Check if new part is contained in the combined previous parts
    const combined = parts.join(" ").toLowerCase().trim();
    if (combined.includes(newPartNormalized)) return true;

    // Check for high word overlap (>80% of words already present)
    const newWords = newPartNormalized.split(/\s+/).filter((w) => w.length > 0);
    const combinedWords = new Set(
      combined.split(/\s+/).filter((w) => w.length > 0)
    );
    if (newWords.length > 0) {
      const overlapCount = newWords.filter((w) => combinedWords.has(w)).length;
      if (overlapCount / newWords.length > 0.8) return true;
    }

    return false;
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

    // 0) Handle sentence-level repetition first
    normalized = this.collapseSentenceRepeats(normalized);

    // 1) If the full text is a repeated substring (e.g., 'A A' or 'A A A'), collapse to single A
    const n = normalized.length;
    if (n > 0) {
      const lps: number[] = new Array(n).fill(0);
      for (let i = 1; i < n; i++) {
        let j = lps[i - 1];
        while (j > 0 && normalized[i] !== normalized[j]) j = lps[j - 1];
        if (normalized[i] === normalized[j]) j++;
        lps[i] = j;
      }
      const period = n - lps[n - 1];
      if (period < n && n % period === 0) {
        normalized = normalized.slice(0, period).trim();
      }
    }

    // 2) Collapse adjacent repeated word blocks (case-insensitive, up to 30 words)
    const words = normalized.split(" ").filter((w) => w.length > 0);
    const maxBlockSize = Math.min(30, Math.floor(words.length / 2));
    for (let block = maxBlockSize; block >= 1; block--) {
      let i = 0;
      while (i + 2 * block <= words.length) {
        const blockA = words.slice(i, i + block).join(" ").toLowerCase();
        const blockB = words.slice(i + block, i + 2 * block).join(" ").toLowerCase();
        if (blockA === blockB) {
          words.splice(i + block, block);
        } else {
          i++;
        }
      }
    }

    // 3) Collapse adjacent identical words (case-insensitive, preserve first occurrence's case)
    const collapsedWords: string[] = [];
    for (const w of words) {
      if (
        collapsedWords.length === 0 ||
        collapsedWords[collapsedWords.length - 1].toLowerCase() !== w.toLowerCase()
      ) {
        collapsedWords.push(w);
      }
    }
    return collapsedWords.join(" ").trim();
  }

  /**
   * Collapse sentence-level repetitions.
   * Handles cases like "Hello world. Hello world." or "Hello world hello world".
   */
  private collapseSentenceRepeats(text: string): string {
    if (!text || text.length < 10) return text;

    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length < 4) return text;

    const halfLen = Math.floor(words.length / 2);
    const firstHalf = words
      .slice(0, halfLen)
      .join(" ")
      .toLowerCase()
      .replace(/[.,!?]/g, "");
    const secondHalf = words
      .slice(halfLen, halfLen * 2)
      .join(" ")
      .toLowerCase()
      .replace(/[.,!?]/g, "");

    if (firstHalf === secondHalf) {
      const remainder = words.slice(halfLen * 2);
      return [...words.slice(0, halfLen), ...remainder].join(" ");
    }

    // Check for near-duplicate (>90% word similarity)
    const firstWords = firstHalf.split(/\s+/);
    const secondWords = secondHalf.split(/\s+/);
    if (firstWords.length === secondWords.length && firstWords.length > 3) {
      let matchCount = 0;
      for (let i = 0; i < firstWords.length; i++) {
        if (firstWords[i] === secondWords[i]) matchCount++;
      }
      if (matchCount / firstWords.length > 0.9) {
        const remainder = words.slice(halfLen * 2);
        return [...words.slice(0, halfLen), ...remainder].join(" ");
      }
    }

    return text;
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
        "Listening started (continuous mode with auto-resume on end)",
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
      if (this.speechEndHandler)
        this.recognition.removeEventListener(
          "speechend",
          this.speechEndHandler as EventListener
        );
      if (this.audioEndHandler)
        this.recognition.removeEventListener(
          "audioend",
          this.audioEndHandler as EventListener
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

// ==========================================================================
// Browser Compatibility Helper
// ==========================================================================

export interface CompatibilityInfo {
  /** Whether the Web Speech Recognition API is available in this browser */
  stt: boolean;
  /** Whether Piper TTS is supported (Web Audio API present) */
  tts: boolean;
  /** Detected browser label */
  browser: "Chrome" | "Edge" | "Firefox" | "Safari" | "unknown";
}

/**
 * Returns a snapshot of browser feature support relevant to this library.
 * Useful for gating UI elements or showing user-friendly warnings before
 * attempting to start STT or TTS.
 *
 * @example
 * const { stt, browser } = getCompatibilityInfo();
 * if (!stt) alert(`Speech input is not supported in ${browser}.`);
 */
export function getCompatibilityInfo(): CompatibilityInfo {
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent || "" : "";

  let browser: CompatibilityInfo["browser"] = "unknown";
  // Edge must be checked before Chrome because Edge UA also contains "Chrome"
  if (userAgent.includes("Edg/") || userAgent.includes("Edge/"))
    browser = "Edge";
  else if (userAgent.includes("Chrome")) browser = "Chrome";
  else if (userAgent.includes("Firefox")) browser = "Firefox";
  else if (userAgent.includes("Safari")) browser = "Safari";

  const stt =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const tts =
    typeof window !== "undefined" &&
    !!(window.AudioContext || (window as any).webkitAudioContext);

  return { stt, tts, browser };
}

// Backward-compatible alias so consumers can import STTLogic as before
export class STTLogic extends ResetSTTLogic {}
