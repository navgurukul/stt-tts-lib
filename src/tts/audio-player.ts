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
