/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 */

import {
  createAudioPlayer,
  sharedAudioPlayer,
} from "../tts/audio-player.js";
import type { AudioPlayer } from "../tts/audio-player.js";
import type { SharedAudioPlayer, SharedAudioPlayerConfig } from "./types.js";

function wrapPlayer(player: AudioPlayer): SharedAudioPlayer {
  return {
    configure: (config) => {
      if (config.volume !== undefined) {
        player.setVolume(config.volume);
      }
    },
    enqueue: (audio, sampleRate) =>
      player.addAudioIntoQueue(audio, sampleRate),
    stop: () => player.stop(),
    clearQueue: () => player.clearQueue(),
    stopAndClear: () => player.stopAndClearQueue(),
    waitUntilIdle: () => player.waitForQueueCompletion(),
    setVolume: (volume) => player.setVolume(volume),
    setStatusCallback: (cb) => player.setStatusCallback(cb),
    setPlayingChangeCallback: (cb) => player.setPlayingChangeCallback(cb),
    getQueueSize: () => player.getQueueSize(),
    isPlaying: () => player.isAudioPlaying(),
  };
}

/**
 * App-wide shared queue (singleton). Used by default for TTS playback.
 */
export function useSharedAudioPlayer(): SharedAudioPlayer {
  return {
    configure: (config) => sharedAudioPlayer.configure(config),
    enqueue: (audio, sampleRate) =>
      sharedAudioPlayer.addAudioIntoQueue(audio, sampleRate),
    stop: () => sharedAudioPlayer.stop(),
    clearQueue: () => sharedAudioPlayer.clearQueue(),
    stopAndClear: () => sharedAudioPlayer.stopAndClearQueue(),
    waitUntilIdle: () => sharedAudioPlayer.waitForQueueCompletion(),
    setVolume: (volume) => sharedAudioPlayer.setVolume(volume),
    setStatusCallback: (cb) => sharedAudioPlayer.setStatusCallback(cb),
    setPlayingChangeCallback: (cb) =>
      sharedAudioPlayer.setPlayingChangeCallback(cb),
    getQueueSize: () => sharedAudioPlayer.getQueueSize(),
    isPlaying: () => sharedAudioPlayer.isAudioPlaying(),
  };
}

/** Standalone player instance with its own queue. */
export function createSharedAudioPlayer(
  config?: SharedAudioPlayerConfig,
): SharedAudioPlayer {
  const player = createAudioPlayer(config);
  return wrapPlayer(player);
}
