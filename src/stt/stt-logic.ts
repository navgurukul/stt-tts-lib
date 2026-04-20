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
  lastDuration: number | null,
) => void;
export type VadCallbacks = {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
};

type LogCallback = (
  message: string,
  type?: "info" | "error" | "warning",
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
  /**
   * @deprecated No longer used. Silent session rotation is now driven purely
   *             by the browser's own `end` event — the library never forces a
   *             rotation on a timer. This option is accepted for API
   *             compatibility and otherwise ignored.
   */
  sessionDurationMs?: number;
  /**
   * @deprecated No longer used. The interim → final promotion is now handled
   *             per-result via the Web Speech `isFinal` flag. Kept for API
   *             compatibility.
   */
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
   * Called on every recognition update (interim AND final) with the current
   * full live transcript (committed + current session finals + in-flight
   * partial). Useful for real‑time UI updates.
   *
   * This fires continuously in BOTH modes (continueOnSilence true or false)
   * and is NEVER suppressed during silent session rotations, so the UI
   * always reflects the actual text the user has spoken so far.
   */
  onInterimTranscript?: (text: string) => void;

  /**
   * Controls when the final `onTranscript` callback fires.
   *
   * - `true` (default) — "continuous / manual-stop" mode. The library keeps
   *   listening until the consumer explicitly calls `stop()`. `onTranscript`
   *   is fired exactly ONCE, on stop, with the full accumulated transcript.
   *   Internal Web Speech session rotations (the ~60s browser timeout or any
   *   forced restart) are fully silent: `onTranscript` is NOT fired and the
   *   in-memory transcript is preserved across the restart.
   *
   * - `false` — "silence-triggered" mode. The library watches for user
   *   silence; once the user has been silent for `silenceThresholdMs`, the
   *   final transcript is emitted via `onTranscript` and listening is
   *   stopped automatically.
   *
   * In BOTH modes, `onInterimTranscript` is invoked live throughout.
   */
  continueOnSilence?: boolean;

  /**
   * Silence duration (ms) after which the transcript is auto-emitted and
   * listening is stopped. Only used when `continueOnSilence` is `false`.
   * Default: 1500ms.
   */
  silenceThresholdMs?: number;
}

// Alias to match previous public surface
export type STTLogicOptions = ResetSTTOptions;

export class ResetSTTLogic {
  private recognition: any;
  private isListening: boolean = false;
  private onLog: LogCallback;
  private onTranscript: TranscriptCallback;
  private onWordsUpdate: WordUpdateCallback | null = null;
  private onMicTimeUpdate: MicTimeUpdateCallback | null = null;
  private onRestartMetrics: RestartMetricsCallback | null = null;
  private options: {
    sessionDurationMs: number;
    interimSaveIntervalMs: number;
    preserveTranscriptOnStart: boolean;
    continueOnSilence: boolean;
    silenceThresholdMs: number;
  };

  private micOnTime: number = 0;
  private sessionDuration: number = 30000;
  private lastTickTime: number = 0;
  private micTimeInterval: number | null = null;
  private restartCount: number = 0;
  private isRestarting: boolean = false;
  private isRecognitionRunning: boolean = false;
  private onInterimTranscriptCallback?: (text: string) => void;

  // ---------------------------------------------------------------------------
  // Transcript model (dedup-safe, restart-safe)
  //
  // committedTranscript  - text committed from prior recognition sessions,
  //                        never re-emitted or re-processed.
  // currentSessionFinals - final result segments of the ACTIVE session,
  //                        indexed by SpeechRecognitionResult order.
  // currentInterim       - the trailing in-flight partial of the ACTIVE
  //                        session (not yet final).
  // processedFinalCount  - number of SpeechRecognitionResult entries in the
  //                        current session already ingested as final. Used to
  //                        avoid double-counting the same final result that
  //                        appears on every subsequent `result` event.
  // ---------------------------------------------------------------------------
  private committedTranscript: string = "";
  private currentSessionFinals: string[] = [];
  private currentInterim: string = "";
  private processedFinalCount: number = 0;

  private heardWords: string[] = []; // kept for backward-compat (onWordsUpdate)

  // Silence detection (for continueOnSilence === false)
  private lastResultTime: number = 0;
  private silenceAutoStopScheduled: boolean = false;

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
    options: ResetSTTOptions = {},
  ) {
    this.onLog = onLog;
    this.onTranscript = onTranscript;
    this.options = {
      sessionDurationMs: options.sessionDurationMs ?? 30000,
      interimSaveIntervalMs: options.interimSaveIntervalMs ?? 5000,
      preserveTranscriptOnStart: options.preserveTranscriptOnStart ?? false,
      continueOnSilence: options.continueOnSilence ?? true,
      silenceThresholdMs: Math.max(200, options.silenceThresholdMs ?? 1500),
    };
    this.sessionDuration = this.options.sessionDurationMs;
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
        "info",
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
    onSpeechEnd?: () => void,
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
    return this.composeTranscript(true);
  }

  public clearTranscript(): void {
    this.committedTranscript = "";
    this.currentSessionFinals = [];
    this.currentInterim = "";
    this.processedFinalCount = 0;
    this.heardWords = [];
  }

  /**
   * Build the current full transcript from the three buckets.
   * @param includeInterim whether to include the in-flight interim partial.
   */
  private composeTranscript(includeInterim: boolean): string {
    const parts: string[] = [];
    const committed = this.committedTranscript.trim();
    if (committed.length) parts.push(committed);

    if (this.currentSessionFinals.length) {
      const session = this.currentSessionFinals.join(" ").trim();
      if (session.length) parts.push(session);
    }

    if (includeInterim) {
      const interim = this.currentInterim.trim();
      if (interim.length) parts.push(interim);
    }

    if (parts.length === 0) return "";
    return this.collapseRepeats(parts.join(" "));
  }

  /**
   * Fold the active session's finals + interim into the committed transcript
   * and reset per-session state. Intended to be called right before a silent
   * recognition rotation (either our performRestart or an implicit `end`
   * from Web Speech). Never emits onTranscript.
   */
  private commitCurrentSession(): void {
    const tail = this.composeTranscript(true);
    this.committedTranscript = tail;
    this.currentSessionFinals = [];
    this.currentInterim = "";
    this.processedFinalCount = 0;
  }

  private setupRecognition(): void {
    this.recognition.lang = "en-US";
    this.recognition.interimResults = true;
    this.recognition.continuous = true;
    (this.recognition as any).maxAlternatives = 1;

    this.resultHandler = (event: Event) => {
      const speechEvent = event as SpeechRecognitionEvent;
      const results = speechEvent.results;
      const now = Date.now();

      // --- 1. Pick up newly-final results we haven't yet accounted for ----
      //   Web Speech keeps all historical results in `results` and flips each
      //   slot's `isFinal` from false -> true as it settles. Using a high-
      //   water mark (`processedFinalCount`) guarantees each final result is
      //   ingested exactly once, which is the root fix for the duplicated
      //   words/lines observed in the prior implementation.
      for (let i = this.processedFinalCount; i < results.length; i++) {
        if (results[i].isFinal) {
          const text = (results[i][0]?.transcript || "").trim();
          if (text.length > 0) this.currentSessionFinals.push(text);
          this.processedFinalCount = i + 1;
        }
      }

      // --- 2. Rebuild the in-flight interim from trailing non-final slots -
      let interim = "";
      for (let i = this.processedFinalCount; i < results.length; i++) {
        if (!results[i].isFinal) {
          const t = (results[i][0]?.transcript || "").trim();
          if (t.length) interim += (interim ? " " : "") + t;
        }
      }
      this.currentInterim = interim;
      this.lastResultTime = now;

      const lastIsFinal =
        results.length > 0 && results[results.length - 1].isFinal;

      // --- 3. VAD heuristic (rough, webspeech has no true VAD events) -----
      if (!lastIsFinal && this.lastWasFinal) {
        internalSpeechState.setSpeaking(true);
        try {
          this.onUserSpeechStart?.();
        } catch {}
      }
      if (lastIsFinal && !this.lastWasFinal) {
        internalSpeechState.setSpeaking(false);
        try {
          this.onUserSpeechEnd?.();
        } catch {}
      }
      this.lastWasFinal = lastIsFinal;

      // --- 4. Filler manager (partials only) ------------------------------
      if (this.fillerManager && !lastIsFinal && this.currentInterim) {
        this.fillerManager.updatePartialTranscript(this.currentInterim);
      }

      // --- 5. Restart-first-result telemetry ------------------------------
      if (this.awaitingRestartFirstResultId != null) {
        const rid = this.awaitingRestartFirstResultId;
        if (
          this.restartMetrics[rid] &&
          !this.restartMetrics[rid].firstResultAt
        ) {
          this.restartMetrics[rid].firstResultAt = now;
          const delta = now - this.restartMetrics[rid].requestedAt;
          this.onLog(
            `🔔 First result after restart #${rid} in ${delta}ms`,
            "info",
          );
          this.awaitingRestartFirstResultId = null;
        }
      }

      const live = this.composeTranscript(true);
      this.onLog(
        `[${lastIsFinal ? "FINAL" : "INTERIM"}] "${live}"`,
        lastIsFinal ? "info" : "warning",
      );

      // --- 6. Live UI updates (ALWAYS fired, in both modes) ---------------
      //   onInterimTranscript receives the full live transcript (committed +
      //   current session finals + in-flight partial) on EVERY update so the
      //   consumer can render a continuously-growing live view.
      if (this.onInterimTranscriptCallback) {
        try {
          this.onInterimTranscriptCallback(live);
        } catch {}
      }

      // --- 7. Backward-compat heard-words feed ---------------------------
      if (this.onWordsUpdate) {
        const words = live.split(/\s+/).filter((w) => w.length > 0);
        this.heardWords = words;
        try {
          this.onWordsUpdate(words);
        } catch {}
      }

      // NOTE: `onTranscript` is intentionally NOT invoked from here. It is
      // emitted only on explicit stop() (both modes) or when the silence
      // threshold is crossed (continueOnSilence === false). Silent session
      // rotations therefore never leak a premature final transcript.
    };
    this.recognition.addEventListener("result", this.resultHandler);

    this.errorHandler = (event: Event) => {
      const errorEvent = event as SpeechRecognitionErrorEvent;
      if (errorEvent.error === "aborted" && this.isRestarting) {
        this.onLog("Aborted during restart (ignored)", "info");
        this.isRecognitionRunning = false;
        return;
      }
      this.onLog(`SpeechRecognition error: ${errorEvent.error}`, "error");
      // For all errors we simply flip the running flag. The browser will
      // fire an `end` event right after, which the endHandler routes into
      // performRestart() — a single, unified silent-restart path.
      this.isRecognitionRunning = false;
    };
    this.recognition.addEventListener("error", this.errorHandler);

    this.endHandler = () => {
      this.isRecognitionRunning = false;

      // Consumer explicitly stopped — do nothing.
      if (!this.isListening) return;
      // A planned restart is already in flight — let it finish.
      if (this.isRestarting) return;

      // Web Speech ended on its own while the consumer is still listening
      // and silence has not yet triggered an auto-stop. Route through the
      // single silent-restart helper.
      console.info(
        `%c[STT] 🔴 Session ENDED by Web Speech (sessionId=${this.sessionId}) — will silently restart`,
        "color:#c0392b;font-weight:bold",
      );
      this.performRestart();
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
            "info",
          );
        }
      }
    };
    this.recognition.addEventListener("start", this.startHandler);
  }

  private waitForEventOnce(
    eventName: string,
    timeoutMs: number,
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

    this.micTimeInterval = window.setInterval(() => {
      if (!this.isListening) return;
      const now = Date.now();
      const elapsed = now - this.lastTickTime;
      this.micOnTime += elapsed;
      this.lastTickTime = now;

      // NOTE: we intentionally do NOT force a session rotation on a timer
      //   anymore. Web Speech's own `end` event is the single source of
      //   truth — when the browser decides to end the session we handle it
      //   via `performRestart()` invoked from the end handler.

      // Silence-triggered auto-stop (only when continueOnSilence === false).
      //   Fires exactly once per session; `silenceAutoStopScheduled` is
      //   reset on the next start().
      if (
        !this.options.continueOnSilence &&
        !this.silenceAutoStopScheduled &&
        !this.isRestarting &&
        this.lastResultTime > 0 &&
        now - this.lastResultTime >= this.options.silenceThresholdMs &&
        this.composeTranscript(false).trim().length > 0
      ) {
        this.silenceAutoStopScheduled = true;
        const silenceFor = ((now - this.lastResultTime) / 1000).toFixed(1);
        this.onLog(
          `🤫 Silence of ${silenceFor}s >= threshold — auto-emitting final transcript`,
          "info",
        );
        // Defer to next tick so we don't re-enter the interval callback.
        window.setTimeout(() => {
          if (this.isListening) this.stop();
        }, 0);
      }

      if (this.onMicTimeUpdate) this.onMicTimeUpdate(this.micOnTime);
    }, 100);
  }

  private stopMicTimer(): void {
    if (this.micTimeInterval) {
      clearInterval(this.micTimeInterval);
      this.micTimeInterval = null;
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

  /**
   * Silent restart. Called only when Web Speech has ended the current
   * session on its own (`end` event) while the consumer is still listening
   * and silence has NOT yet fired. The active session is folded into the
   * committed transcript and a fresh recognition session is started.
   *
   * `onTranscript` is never invoked from this path — to the consumer the
   * session looks uninterrupted. `onInterimTranscript` continues to receive
   * live updates once the new session produces results.
   */
  private performRestart(): void {
    if (!this.isListening || this.isRestarting) return;
    // Browser already ended recognition, so `isRecognitionRunning` must be
    // false here. If somehow it isn't, let the existing session continue.
    if (this.isRecognitionRunning) return;

    const requestedAt = Date.now();
    this.restartCount++;
    this.isRestarting = true;
    this.isAutoRestarting = true;
    const rid = ++this.sessionId;
    this.awaitingRestartFirstResultId = rid;
    this.restartMetrics[rid] = { requestedAt };

    this.onLog(
      `🔄 [SILENT-RESTART] Session ${rid} — webspeech ended, rotating silently`,
      "warning",
    );
    console.info(
      `%c[STT] 🔄 Silent restart requested (newSessionId=${rid}, restartCount=${this.restartCount}) — committing ${this.currentSessionFinals.length} final segment(s) + interim into memory`,
      "color:#d35400;font-weight:bold",
    );

    // Fold active session (finals + interim) into the committed transcript
    // and reset the per-session high-water mark so the next session starts
    // with fresh result indices.
    this.commitCurrentSession();

    // Small delay avoids tight restart loops if the browser is flaky.
    setTimeout(() => {
      if (!this.isListening) {
        this.isRestarting = false;
        this.isAutoRestarting = false;
        return;
      }

      this.restartMetrics[rid].startAttemptAt = Date.now();
      try {
        if (!this.isRecognitionRunning) {
          this.recognition.start();
          this.isRecognitionRunning = true;
        }
      } catch (e) {
        this.onLog(`Failed to start recognition after restart: ${e}`, "error");
      }

      // Telemetry: wait for `start` to record actual startedAt.
      void (async () => {
        const startEv = await this.waitForEventOnce("start", 1000);
        if (startEv) this.restartMetrics[rid].startedAt = Date.now();

        const startedAt =
          this.restartMetrics[rid].startedAt ||
          this.restartMetrics[rid].startAttemptAt ||
          Date.now();
        const restartDuration =
          startedAt - this.restartMetrics[rid].requestedAt;
        if (this.onRestartMetrics)
          this.onRestartMetrics(this.restartCount, restartDuration);
        this.onLog(
          `✅ Session ${rid} restarted silently in ${restartDuration}ms`,
          "info",
        );
        console.info(
          `%c[STT] 🟢 Session RESTARTED silently (sessionId=${rid}) in ${restartDuration}ms — committed="${this.committedTranscript}"`,
          "color:#1e8449;font-weight:bold",
        );

        this.isRestarting = false;
        this.isAutoRestarting = false;
      })();
    }, 150);
  }

  public start(): void {
    if (this.isListening) return;

    try {
      this.isListening = true;
      if (!this.options.preserveTranscriptOnStart) {
        this.clearTranscript();
      } else {
        // Preserve prior transcript, but still start the upcoming session
        // with a clean per-session buffer so result indices line up with
        // processedFinalCount = 0.
        this.currentSessionFinals = [];
        this.currentInterim = "";
        this.processedFinalCount = 0;
      }

      this.micOnTime = 0;
      this.restartCount = 0;
      this.lastWasFinal = false;
      this.lastResultTime = 0;
      this.silenceAutoStopScheduled = false;

      if (!this.isRecognitionRunning) {
        this.sessionId++;
        this.recognition.start();
        this.isRecognitionRunning = true;
      }
      this.startMicTimer();
      this.onLog(
        `Listening started (mode=${
          this.options.continueOnSilence
            ? "continuous/manual-stop"
            : "silence-triggered"
        }${
          this.options.continueOnSilence
            ? ""
            : `, silenceThreshold=${this.options.silenceThresholdMs}ms`
        }, silent restart on browser end)`,
        "info",
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
      // Guard against the silence-detection tick firing between here and
      // when the recognition actually stops.
      this.silenceAutoStopScheduled = true;
      this.stopMicTimer();

      // Fold the active session (finals + interim) into the committed
      // transcript before emitting. This is the one and only place the
      // consumer-facing `onTranscript` callback is invoked.
      this.commitCurrentSession();
      const finalTranscript = this.committedTranscript.trim();

      try {
        this.recognition.stop();
      } catch (e) {
        // Ignore; destroy() will also attempt abort.
      }
      this.isRecognitionRunning = false;

      this.onLog(
        `Stopped listening (total mic time: ${(this.micOnTime / 1000).toFixed(
          1,
        )}s, restarts: ${this.restartCount})`,
        "info",
      );
      console.info(
        `%c[STT] ⏹️  Explicit STOP — emitting onTranscript once (len=${finalTranscript.length}, silent restarts during session=${this.restartCount})`,
        "color:#2c3e50;font-weight:bold",
      );

      // Emit the final transcript exactly once.
      try {
        this.onTranscript(finalTranscript);
      } catch (e) {
        this.onLog(`onTranscript callback threw: ${e}`, "warning");
      }

      if (this.onWordsUpdate) {
        const words = finalTranscript.split(/\s+/).filter((w) => w.length > 0);
        this.heardWords = words;
        try {
          this.onWordsUpdate(words);
        } catch {}
      }
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
          this.endHandler as EventListener,
        );
      if (this.startHandler)
        this.recognition.removeEventListener(
          "start",
          this.startHandler as EventListener,
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
      text: string,
    ) => Promise<{ audio: Float32Array; sampleRate: number }>,
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
    !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );

  const tts =
    typeof window !== "undefined" &&
    !!(window.AudioContext || (window as any).webkitAudioContext);

  return { stt, tts, browser };
}

// Backward-compatible alias so consumers can import STTLogic as before
export class STTLogic extends ResetSTTLogic {}
