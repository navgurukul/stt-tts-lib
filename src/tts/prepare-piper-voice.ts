export interface PiperVoiceConfig {
  voiceId: string;
  modelPath?: string;
  sampleRate?: number;
  lengthScale?: number;
  noiseScale?: number;
  speaker?: string;
}

export interface PreparedPiperVoice {
  voiceId: string;
  modelPath: string;
  sampleRate: number;
  inference: {
    lengthScale: number;
    noiseScale: number;
  };
  metadata: Record<string, unknown>;
}

/**
 * Normalize Piper voice configuration so downstream synthesis gets predictable defaults.
 */
export function preparePiperVoice(config: PiperVoiceConfig): PreparedPiperVoice {
  const modelPath = config.modelPath ?? `voices/${config.voiceId}.onnx`;

  return {
    voiceId: config.voiceId,
    modelPath,
    sampleRate: config.sampleRate ?? 22050,
    inference: {
      lengthScale: config.lengthScale ?? 1.0,
      noiseScale: config.noiseScale ?? 0.667,
    },
    metadata: {
      speaker: config.speaker ?? "default",
    },
  };
}
