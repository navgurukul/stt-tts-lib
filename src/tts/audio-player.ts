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

/**
 * Web Audio API Player with Singleton Support
 *
 * Can be used as:
 * 1. Singleton (recommended): sharedAudioPlayer - same queue across entire app
 * 2. Custom instance: new AudioPlayer(config) - separate queue
 *
 * Speech-aware: Automatically pauses queue when user is speaking (via STTLogic).
 */

export interface AudioPlayerConfig {
  sampleRate?: number;
  volume?: number;
  autoPlay?: boolean;
}

export interface QueuedAudio {
  audioData: Float32Array;
  sampleRate: number;
}

export type AudioPlayerStatusCallback = (status: string) => void;
export type PlayingStateCallback = (playing: boolean) => void;

/**
 * Audio Player for Web Audio API
 * Supports queue-based playback with autoPlay
 */
export class AudioPlayer {
  private static instance: AudioPlayer | null = null;
  private static sharedConfig: AudioPlayerConfig = {
    sampleRate: 22050,
    volume: 1.0,
    autoPlay: true,
  };

  private audioContext: AudioContext | null = null;
  private config: AudioPlayerConfig;
  private currentSource: AudioBufferSourceNode | null = null;

  // Queue-related properties
  private audioQueue: QueuedAudio[] = [];
  private isPlaying = false;
  private isQueueProcessing = false;
  private onStatusCallback?: AudioPlayerStatusCallback;
  private onPlayingChangeCallback?: PlayingStateCallback;

  // Speech-aware playback: pause queue while user is speaking
  private userSpeaking = false;
  private onUserSpeakingChangeCallback?: (speaking: boolean) => void;
  private speechStateUnsubscribe?: () => void;

  constructor(config: AudioPlayerConfig = {}) {
    this.config = {
      sampleRate: 22050,
      volume: 1.0,
      autoPlay: false,
      ...config,
    };

    // Auto-subscribe to internal speech state (from STTLogic)
    this.speechStateUnsubscribe = internalSpeechState.onSpeakingChange(
      (speaking) => {
        this.setUserSpeaking(speaking);
      }
    );
  }

  // ==========================================================================
  // Singleton Methods (Static)
  // ==========================================================================

  /**
   * Configure the shared singleton (call before first use)
   */
  static configure(config: AudioPlayerConfig): void {
    if (AudioPlayer.instance) {
      console.log(
        "[AudioPlayer] Singleton already initialized. Call reset() first to reconfigure."
      );
      return;
    }
    AudioPlayer.sharedConfig = { ...AudioPlayer.sharedConfig, ...config };
  }

  /**
   * Get the singleton instance (creates if not exists)
   */
  static getInstance(): AudioPlayer {
    if (!AudioPlayer.instance) {
      AudioPlayer.instance = new AudioPlayer(AudioPlayer.sharedConfig);
      console.log(
        "[AudioPlayer] Singleton initialized with config:",
        AudioPlayer.sharedConfig
      );
    }
    return AudioPlayer.instance;
  }

  /**
   * Reset the singleton (for reconfiguration)
   */
  static async reset(): Promise<void> {
    if (AudioPlayer.instance) {
      await AudioPlayer.instance.close();
      AudioPlayer.instance = null;
    }
  }

  // ==========================================================================
  // Instance Methods
  // ==========================================================================

  /**
   * Set status callback for logging
   */
  setStatusCallback(callback: AudioPlayerStatusCallback): void {
    this.onStatusCallback = callback;
  }

  /**
   * Set callback for playing state changes
   */
  setPlayingChangeCallback(callback: PlayingStateCallback): void {
    this.onPlayingChangeCallback = callback;
  }

  /**
   * Check if audio is currently playing
   */
  isAudioPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.audioQueue.length;
  }

  // ==========================================================================
  // Speech-Aware Playback
  // ==========================================================================

  /**
   * Set user speaking state
   * When user is speaking, queue playback is paused
   * When user stops speaking, queue playback resumes (if autoPlay enabled)
   */
  setUserSpeaking(speaking: boolean): void {
    if (this.userSpeaking === speaking) return;

    this.userSpeaking = speaking;
    this.log(`[AudioPlayer] User speaking: ${speaking}`);
    this.onUserSpeakingChangeCallback?.(speaking);

    // When user stops speaking, resume queue playback if autoPlay is enabled
    if (!speaking && this.config.autoPlay && this.audioQueue.length > 0) {
      this.log("[AudioPlayer] User stopped speaking, resuming queue playback");
      this.playAudiosFromQueue();
    }
  }

  /**
   * Check if user is currently speaking
   */
  isUserSpeaking(): boolean {
    return this.userSpeaking;
  }

  /**
   * Set callback for user speaking state changes
   */
  setUserSpeakingChangeCallback(callback: (speaking: boolean) => void): void {
    this.onUserSpeakingChangeCallback = callback;
  }

  /**
   * Add audio to the queue
   * Note: If user is speaking, audio is queued but NOT played until user stops
   */
  addAudioIntoQueue(audioData: Float32Array, sampleRate?: number): void {
    const audio: QueuedAudio = {
      audioData,
      sampleRate: sampleRate ?? this.config.sampleRate!,
    };
    this.audioQueue.push(audio);
    this.log(
      `[AudioPlayer] Added audio to queue (samples: ${audioData.length}, queue size: ${this.audioQueue.length}, userSpeaking: ${this.userSpeaking})`
    );

    // Don't start playback if already processing
    if (this.isQueueProcessing) {
      return;
    }

    // Don't start playback if user is speaking - wait until they stop
    if (this.userSpeaking) {
      this.log(
        "[AudioPlayer] User is speaking, audio queued but playback paused"
      );
      return;
    }

    // Start playback if autoPlay enabled
    if (this.config.autoPlay) {
      this.playAudiosFromQueue();
    }
  }

  /**
   * Start playing audios from the queue sequentially
   * Pauses if user starts speaking, resumes when they stop
   */
  async playAudiosFromQueue(): Promise<void> {
    if (this.audioQueue.length === 0) {
      return;
    }

    // Don't start if user is speaking
    if (this.userSpeaking) {
      this.log("[AudioPlayer] Cannot start queue playback - user is speaking");
      return;
    }

    this.isQueueProcessing = true;
    this.log("[AudioPlayer] Starting queue playback");

    try {
      while (this.audioQueue.length > 0) {
        // Pause playback if user starts speaking mid-queue
        if (this.userSpeaking) {
          this.log(
            "[AudioPlayer] User started speaking, pausing queue playback"
          );
          break;
        }

        const audio = this.audioQueue.shift();
        if (audio) {
          this.setPlayingState(true);
          await this.play(audio.audioData, audio.sampleRate);
        }
      }
    } catch (error) {
      this.log(`[AudioPlayer] Queue playback error: ${error}`);
    } finally {
      this.isQueueProcessing = false;
      this.setPlayingState(false);
      this.log("[AudioPlayer] Queue playback finished");
    }
  }

  /**
   * Play audio data directly
   */
  async play(audioData: Float32Array, sampleRate: number): Promise<void> {
    const ctx = this.getAudioContext();

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const audioBuffer = ctx.createBuffer(1, audioData.length, sampleRate);
    audioBuffer.getChannelData(0).set(audioData);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = this.config.volume!;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    this.currentSource = source;
    source.start(0);

    return new Promise<void>((resolve) => {
      source.onended = () => {
        this.currentSource = null;
        resolve();
      };
    });
  }

  /**
   * Stop current playback (does not clear queue)
   */
  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource = null;
      } catch (error) {
        // Ignore errors if already stopped
      }
    }
  }

  /**
   * Clear the audio queue
   */
  clearQueue(): void {
    this.audioQueue = [];
    this.log("[AudioPlayer] Queue cleared");
  }

  /**
   * Stop playback and clear the queue
   */
  stopAndClearQueue(): void {
    this.isQueueProcessing = false;
    this.stop();
    this.clearQueue();
    this.setPlayingState(false);
    this.log("[AudioPlayer] Stopped playback and cleared queue");
  }

  /**
   * Wait for all queued audio to finish playing
   */
  async waitForQueueCompletion(): Promise<void> {
    while (this.audioQueue.length > 0 || this.isPlaying) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(volume: number): void {
    this.config.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Close the audio context and free resources
   */
  async close(): Promise<void> {
    this.stop();
    if (this.speechStateUnsubscribe) {
      this.speechStateUnsubscribe();
    }
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private setPlayingState(playing: boolean): void {
    if (this.isPlaying !== playing) {
      this.isPlaying = playing;
      this.onPlayingChangeCallback?.(playing);
    }
  }

  private log(message: string): void {
    console.log(message);
    this.onStatusCallback?.(message);
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)({
        sampleRate: this.config.sampleRate,
      });
    }
    return this.audioContext;
  }
}

/**
 * Create a new AudioPlayer instance (separate queue)
 */
export function createAudioPlayer(config?: AudioPlayerConfig): AudioPlayer {
  return new AudioPlayer(config);
}

/**
 * Shared AudioPlayer singleton
 * Same queue across STTLogic, TTSLogic, and consumer code
 *
 * Usage:
 *   // Configure once (optional)
 *   AudioPlayer.configure({ autoPlay: true });
 *
 *   // Use anywhere - same queue everywhere
 *   sharedAudioPlayer.addAudioIntoQueue(audioData, sampleRate);
 */
export const sharedAudioPlayer = {
  /** Configure before first use */
  configure: (config: AudioPlayerConfig) => AudioPlayer.configure(config),

  /** Get the singleton instance */
  getInstance: () => AudioPlayer.getInstance(),

  /** Add audio to the shared queue */
  addAudioIntoQueue: (audioData: Float32Array, sampleRate?: number) =>
    AudioPlayer.getInstance().addAudioIntoQueue(audioData, sampleRate),

  /** Play audio directly */
  play: (audioData: Float32Array, sampleRate: number) =>
    AudioPlayer.getInstance().play(audioData, sampleRate),

  /** Start playing from queue */
  playAudiosFromQueue: () => AudioPlayer.getInstance().playAudiosFromQueue(),

  /** Check if playing */
  isAudioPlaying: () => AudioPlayer.getInstance().isAudioPlaying(),

  /** Get queue size */
  getQueueSize: () => AudioPlayer.getInstance().getQueueSize(),

  /** Stop playback */
  stop: () => AudioPlayer.getInstance().stop(),

  /** Clear queue */
  clearQueue: () => AudioPlayer.getInstance().clearQueue(),

  /** Stop and clear */
  stopAndClearQueue: () => AudioPlayer.getInstance().stopAndClearQueue(),

  /** Wait for completion */
  waitForQueueCompletion: () =>
    AudioPlayer.getInstance().waitForQueueCompletion(),

  /** Set volume */
  setVolume: (volume: number) => AudioPlayer.getInstance().setVolume(volume),

  /** Set status callback */
  setStatusCallback: (callback: AudioPlayerStatusCallback) =>
    AudioPlayer.getInstance().setStatusCallback(callback),

  /** Set playing state callback */
  setPlayingChangeCallback: (callback: PlayingStateCallback) =>
    AudioPlayer.getInstance().setPlayingChangeCallback(callback),

  // Speech-aware playback (automatically managed by STTLogic)
  /** Check if user is speaking */
  isUserSpeaking: () => AudioPlayer.getInstance().isUserSpeaking(),

  /** Set callback for speaking state changes */
  setUserSpeakingChangeCallback: (callback: (speaking: boolean) => void) =>
    AudioPlayer.getInstance().setUserSpeakingChangeCallback(callback),

  /** Manual override for speaking state (usually not needed - handled by STTLogic) */
  setUserSpeaking: (speaking: boolean) =>
    AudioPlayer.getInstance().setUserSpeaking(speaking),

  /** Reset singleton */
  reset: () => AudioPlayer.reset(),

  /** Close */
  close: () => AudioPlayer.reset(),
};
