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
