/**
 * stt-tts-lib - Filler Word Manager
 *
 * Generates contextual filler words using LLM at configurable intervals.
 * Audio is synthesized immediately but only plays when user stops speaking.
 */

import { sharedAudioPlayer } from "./audio-player";
import { internalSpeechState } from "../internal/speech-state";
import { TTSLogic } from "./piper-synthesizer";

// System prompt for early (short) filler - brief acknowledgments
const SHORT_FILLER_SYSTEM_PROMPT = `
You are an *interviewer* listening to someone's answer.
Generate brief, natural filler words that show you're actively listening (5-12 words).

Examples: "Okay that makes sense", "Right I understand", "Got it", "I see where you're going", "Yeah that's a good point"

Guidelines:
- Keep responses 5-12 words, natural and varied
- Reference specific content from their speech if possible
- Avoid punctuation except where natural
- Stay in the same language as the user
- If text is unclear, use generic acknowledgments like "Okay I'm following"

Output only your brief reaction. No explanations.
`;

// System prompt for late (long) filler - contextual rephrasing
const LONG_FILLER_SYSTEM_PROMPT = `
You are an *interviewer* listening to someone's answer.
Your role is to rephrase what they said to show deep understanding (15-25 words).

Guidelines:
- Rephrase the user's partial message with specific context
- Extract key concepts and mirror them back
- Examples: "So you're explaining how [concept] works...", "In other words the [topic] connects to..."
- Keep responses 15-25 words, declarative (not questions)
- Reference their actual words and ideas
- Stay in the same language as the user

Output only your contextual rephrasing. No explanations.
`;

export interface FillerConfig {
  /** Enable short filler (default: false) */
  enableShortFiller?: boolean;
  /** Enable long filler (default: false) */
  enableLongFiller?: boolean;
  /** Delay before short filler in ms (default: 5000) */
  shortFillerDelayMs?: number;
  /** Delay before long filler in ms (default: 10000) */
  longFillerDelayMs?: number;
  /** Fallback short filler text if LLM fails */
  shortFillerFallback?: string;
  /** Fallback long filler text if LLM fails */
  longFillerFallback?: string;

  // LLM Configuration
  /** LLM API URL (required for dynamic fillers) */
  llmApiUrl?: string;
  /** LLM API Key */
  llmApiKey?: string;
  /** LLM Model name (default: "deepseek-chat") */
  llmModel?: string;
  /** Custom system prompt for short filler */
  shortFillerPrompt?: string;
  /** Custom system prompt for long filler */
  longFillerPrompt?: string;
  /** LLM request timeout in ms (default: 3000) */
  llmTimeoutMs?: number;
  /** Language hint for LLM (e.g., "English", "Hindi") */
  languageHint?: string;

  // TTS Configuration
  /** TTS voice ID for filler synthesis (uses default if not set) */
  ttsVoice?: string;

  /** Callback when filler is generated */
  onFillerGenerated?: (type: "short" | "long", text: string) => void;
  /** Custom synthesizer function (overrides internal TTS if provided) */
  synthesize?: (
    text: string,
  ) => Promise<{ audio: Float32Array; sampleRate: number }>;
  /** Optional secret header for LLM requests */
  llmSecretKey?: string;
  /** Prior turns for filler context (consumer history preferred). */
  getConversationHistory?: () => {
    role: "user" | "assistant";
    content: string;
  }[];
  /** Max turns to include in filler LLM context (default 10). */
  maxHistoryTurns?: number;
  /**
   * `speechState` — start/stop timers from `internalSpeechState` (legacy STT).
   * `explicit` — call `beginUtteranceFillers()` when a Web Speech utterance starts (STS/VAD).
   */
  utteranceTimerMode?: "speechState" | "explicit";
}

const DEFAULT_CONFIG = {
  enableShortFiller: false,
  enableLongFiller: false,
  shortFillerDelayMs: 5000,
  longFillerDelayMs: 10000,
  shortFillerFallback: "Okay, I understand.",
  longFillerFallback: "Right, that makes sense.",
  llmModel: "deepseek-chat",
  shortFillerPrompt: SHORT_FILLER_SYSTEM_PROMPT,
  longFillerPrompt: LONG_FILLER_SYSTEM_PROMPT,
  llmTimeoutMs: 15000,
  languageHint: "English",
  utteranceTimerMode: "speechState" as "speechState" | "explicit",
};

function mergeFillerConfig(
  base: typeof DEFAULT_CONFIG &
    Pick<
      FillerConfig,
      | "llmApiUrl"
      | "llmApiKey"
      | "llmSecretKey"
      | "onFillerGenerated"
      | "synthesize"
      | "ttsVoice"
      | "getConversationHistory"
      | "maxHistoryTurns"
    >,
  patch: Partial<FillerConfig>,
): typeof base {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

export class FillerManager {
  private config: typeof DEFAULT_CONFIG &
    Pick<
      FillerConfig,
      | "llmApiUrl"
      | "llmApiKey"
      | "llmSecretKey"
      | "onFillerGenerated"
      | "synthesize"
      | "ttsVoice"
      | "getConversationHistory"
      | "maxHistoryTurns"
    >;

  private speechStartedAt = 0;
  private shortFillerTimer: ReturnType<typeof setTimeout> | null = null;
  private longFillerTimer: ReturnType<typeof setTimeout> | null = null;
  private shortFillerGenerated = false;
  private longFillerGenerated = false;
  private unsubscribe?: () => void;
  private currentPartialTranscript = "";
  private inFlight = 0;
  private ttsLogic: TTSLogic | null = null;
  private ttsInitPromise: Promise<void> | null = null;
  private utteranceCancelled = false;
  /** Bumped on each `beginUtteranceFillers()` to ignore stale LLM responses. */
  private activeUtteranceId = 0;

  // Exposed for consumer to see generated fillers
  public shortFiller: string | null = null;
  public longFiller: string | null = null;

  constructor(config: FillerConfig = {}) {
    this.config = mergeFillerConfig({ ...DEFAULT_CONFIG }, config);
    if (this.config.utteranceTimerMode === "speechState") {
      this.setupSpeechStateListener();
    }
    this.initializeTTS();
  }

  private initializeTTS(): void {
    // Only initialize if no custom synthesizer is provided
    if (!this.config.synthesize) {
      this.ttsLogic = new TTSLogic({
        voiceId: this.config.ttsVoice,
        useSharedAudioPlayer: true, // Use shared player for queueing
        warmUp: false,
      });
      this.ttsInitPromise = this.ttsLogic.initialize().catch((err) => {
        console.error("[FillerManager] Failed to initialize TTS:", err);
      });
    }
  }

  /**
   * Update configuration
   */
  configure(config: Partial<FillerConfig>): void {
    this.config = mergeFillerConfig(this.config, config);
  }

  /**
   * Set the synthesizer function
   */
  setSynthesizer(synthesize: FillerConfig["synthesize"]): void {
    this.config.synthesize = synthesize;
  }

  /**
   * Update partial transcript (call this on each STT partial result)
   */
  updatePartialTranscript(text: string): void {
    this.currentPartialTranscript = text;
  }

  private setupSpeechStateListener(): void {
    this.unsubscribe = internalSpeechState.onSpeakingChange((speaking) => {
      if (speaking) {
        this.onSpeechStart();
      } else {
        this.onSpeechEnd();
      }
    });
  }

  /**
   * Start short/long filler timers for the current Web Speech utterance.
   * Resets any prior timers and prior utterance filler state.
   */
  beginUtteranceFillers(): void {
    this.clearTimers();
    this.activeUtteranceId += 1;
    this.utteranceCancelled = false;
    this.speechStartedAt = Date.now();
    this.shortFillerGenerated = false;
    this.longFillerGenerated = false;
    this.shortFiller = null;
    this.longFiller = null;
    this.currentPartialTranscript = "";

    const shortDelay = this.config.shortFillerDelayMs ?? 5000;
    const longDelay = this.config.longFillerDelayMs ?? 10000;

    console.log(
      `[FillerManager] Utterance listening — short filler in ${shortDelay}ms, long in ${longDelay}ms`,
    );

    if (this.config.enableShortFiller) {
      this.shortFillerTimer = setTimeout(() => {
        void this.generateFiller("short");
      }, shortDelay);
    }

    if (this.config.enableLongFiller) {
      this.longFillerTimer = setTimeout(() => {
        void this.generateFiller("long");
      }, longDelay);
    }
  }

  private onSpeechStart(): void {
    this.beginUtteranceFillers();
  }

  private onSpeechEnd(): void {
    console.log("[FillerManager] Speech ended, clearing timers");
    this.clearTimers();
    this.speechStartedAt = 0;
  }

  private clearTimers(): void {
    if (this.shortFillerTimer) {
      clearTimeout(this.shortFillerTimer);
      this.shortFillerTimer = null;
    }
    if (this.longFillerTimer) {
      clearTimeout(this.longFillerTimer);
      this.longFillerTimer = null;
    }
  }

  /**
   * Call when the final transcript is ready: stop scheduling fillers and
   * ignore any in-flight LLM responses for this utterance (fetch is not aborted
   * so DevTools can still show a completed response if the server finishes).
   */
  cancelForFinalTranscript(): void {
    this.utteranceCancelled = true;
    this.clearTimers();
  }

  private async generateFiller(type: "short" | "long"): Promise<void> {
    if (this.utteranceCancelled) return;
    // Prevent duplicate generation
    if (type === "short" && this.shortFillerGenerated) return;
    if (type === "long" && this.longFillerGenerated) return;

    // Mark as generated immediately to prevent race conditions
    if (type === "short") {
      this.shortFillerGenerated = true;
    } else {
      this.longFillerGenerated = true;
    }

    this.inFlight++;
    const utteranceId = this.activeUtteranceId;

    let fillerText: string;

    // Try LLM generation if configured
    if (this.config.llmApiUrl && this.config.llmApiKey) {
      try {
        fillerText = await this.generateFillerWithLLM(type, utteranceId);
        if (
          this.utteranceCancelled ||
          utteranceId !== this.activeUtteranceId
        ) {
          this.inFlight--;
          return;
        }
        console.log(
          `[FillerManager] LLM generated ${type} filler: "${fillerText}"`,
        );
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : String(error);
        if (
          reason === "filler-utterance-stale" ||
          this.utteranceCancelled ||
          utteranceId !== this.activeUtteranceId
        ) {
          this.inFlight--;
          return;
        }
        if (reason === "filler-llm-timeout") {
          console.warn(
            `[FillerManager] ${type} filler LLM timed out after ${this.config.llmTimeoutMs ?? 3000}ms — using fallback`,
          );
        } else {
          console.error(`[FillerManager] LLM failed, using fallback:`, error);
        }
        fillerText =
          type === "short"
            ? this.config.shortFillerFallback
            : this.config.longFillerFallback;
      }
    } else {
      // Use fallback text
      fillerText =
        type === "short"
          ? this.config.shortFillerFallback
          : this.config.longFillerFallback;
      console.log(
        `[FillerManager] Using fallback ${type} filler: "${fillerText}"`,
      );
    }

    // Store generated filler
    if (type === "short") {
      this.shortFiller = fillerText;
    } else {
      this.longFiller = fillerText;
    }

    if (this.utteranceCancelled) {
      this.inFlight--;
      return;
    }

    // Notify consumer
    this.config.onFillerGenerated?.(type, fillerText);

    // Synthesize and queue audio
    try {
      if (this.config.synthesize) {
        // Use custom synthesizer if provided
        const result = await this.config.synthesize(fillerText);
        sharedAudioPlayer.addAudioIntoQueue(result.audio, result.sampleRate);
      } else if (this.ttsLogic) {
        // Use internal TTSLogic's synthesizeAndAddToQueue
        if (this.ttsInitPromise) await this.ttsInitPromise;
        await this.ttsLogic.synthesizeAndAddToQueue(fillerText);
      } else {
        console.warn("[FillerManager] No TTS available for filler synthesis");
      }
      console.log(`[FillerManager] ${type} filler queued for playback`);
    } catch (error) {
      console.error(
        `[FillerManager] Failed to synthesize ${type} filler:`,
        error,
      );
    }

    this.inFlight--;
  }

  private getHistoryMessages(): { role: "user" | "assistant"; content: string }[] {
    const maxTurns = this.config.maxHistoryTurns ?? 10;
    const history = this.config.getConversationHistory?.() ?? [];
    const maxMessages = maxTurns * 2;
    if (history.length <= maxMessages) {
      return history;
    }
    return history.slice(history.length - maxMessages);
  }

  private async generateFillerWithLLM(
    type: "short" | "long",
    utteranceId: number,
  ): Promise<string> {
    const systemPrompt =
      type === "short"
        ? this.config.shortFillerPrompt
        : this.config.longFillerPrompt;

    const userMessage = [
      `Language: ${this.config.languageHint}`,
      "",
      "Current user speech (partial):",
      `"${this.currentPartialTranscript || "(no transcript yet)"}"`,
      "",
      this.shortFiller
        ? `Previous short filler already generated: "${this.shortFiller}"`
        : "",
      "",
      "Output only your natural brief reaction.",
    ]
      .filter(Boolean)
      .join("\n");

    const timeoutMs = this.config.llmTimeoutMs ?? 3000;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.llmApiKey}`,
    };
    if (this.config.llmSecretKey) {
      headers["X-Secret-Key"] = this.config.llmSecretKey;
    }

    const historyMessages = this.getHistoryMessages();

    const body = JSON.stringify({
      model: this.config.llmModel,
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: userMessage },
      ],
      stream: false,
    });

    const fetchPromise = fetch(this.config.llmApiUrl!, {
      method: "POST",
      headers,
      body,
    });

    const response = await Promise.race([
      fetchPromise,
      new Promise<Response>((_, reject) => {
        setTimeout(
          () => reject(new Error("filler-llm-timeout")),
          timeoutMs,
        );
      }),
    ]);

    if (utteranceId !== this.activeUtteranceId || this.utteranceCancelled) {
      throw new Error("filler-utterance-stale");
    }

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    return content.trim().slice(0, 100) || this.getFallback(type);
  }

  private getFallback(type: "short" | "long"): string {
    return type === "short"
      ? this.config.shortFillerFallback
      : this.config.longFillerFallback;
  }

  /**
   * Manually trigger a filler (useful for testing)
   */
  async triggerFiller(type: "short" | "long"): Promise<void> {
    await this.generateFiller(type);
  }

  /**
   * Reset state for new session
   */
  reset(): void {
    this.clearTimers();
    this.speechStartedAt = 0;
    this.shortFillerGenerated = false;
    this.longFillerGenerated = false;
    this.shortFiller = null;
    this.longFiller = null;
    this.currentPartialTranscript = "";
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.clearTimers();
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

// Singleton instance for internal use
let fillerManagerInstance: FillerManager | null = null;

export function getFillerManager(): FillerManager {
  if (!fillerManagerInstance) {
    fillerManagerInstance = new FillerManager();
  }
  return fillerManagerInstance;
}

export function configureFillerManager(config: FillerConfig): FillerManager {
  const manager = getFillerManager();
  manager.configure(config);
  return manager;
}
