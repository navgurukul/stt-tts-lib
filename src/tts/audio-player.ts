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

/**
 * Web Audio API Player
 * Plays synthesized audio using the Web Audio API
 */

export interface AudioPlayerConfig {
  sampleRate?: number;
  volume?: number;
}

/**
 * Audio Player for Web Audio API
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private config: AudioPlayerConfig;
  private currentSource: AudioBufferSourceNode | null = null;

  constructor(config: AudioPlayerConfig = {}) {
    this.config = {
      sampleRate: 22050,
      volume: 1.0,
      ...config,
    };
  }

  /**
   * Initialize the audio context
   */
  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.config.sampleRate,
      });
    }
    return this.audioContext;
  }

  /**
   * Play audio data
   * @param audioData - Float32Array of audio samples
   * @param sampleRate - Sample rate of the audio
   */
  async play(audioData: Float32Array, sampleRate: number): Promise<void> {
    const ctx = this.getAudioContext();

    // Resume audio context if suspended (browser security requirement)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Create audio buffer
    const audioBuffer = ctx.createBuffer(1, audioData.length, sampleRate);
    audioBuffer.getChannelData(0).set(audioData);

    // Create source
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    // Create gain node for volume control
    const gainNode = ctx.createGain();
    gainNode.gain.value = this.config.volume!;

    // Connect nodes
    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Store current source
    this.currentSource = source;

    // Play
    source.start(0);

    // Wait for playback to finish
    return new Promise<void>((resolve) => {
      source.onended = () => {
        this.currentSource = null;
        resolve();
      };
    });
  }

  /**
   * Stop current playback
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
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}

/**
 * Create and return an audio player instance
 */
export function createAudioPlayer(config?: AudioPlayerConfig): AudioPlayer {
  return new AudioPlayer(config);
}
