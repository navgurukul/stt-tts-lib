/**
 * Internal Speech State Manager
 *
 * Shared state between STTLogic and AudioPlayer.
 * NOT exported to consumers - internal library use only.
 */

type SpeechStateListener = (speaking: boolean) => void;

class SpeechStateManager {
  private speaking = false;
  private listeners: SpeechStateListener[] = [];

  /**
   * Set speaking state (called by STTLogic)
   */
  setSpeaking(speaking: boolean): void {
    if (this.speaking === speaking) return;
    this.speaking = speaking;
    this.listeners.forEach((listener) => listener(speaking));
  }

  /**
   * Get current speaking state
   */
  isSpeaking(): boolean {
    return this.speaking;
  }

  /**
   * Subscribe to speaking state changes (called by AudioPlayer)
   */
  onSpeakingChange(listener: SpeechStateListener): () => void {
    this.listeners.push(listener);
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

// Internal singleton - not exported to consumers
export const internalSpeechState = new SpeechStateManager();
