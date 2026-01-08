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

export type OrtDevice = "cpu" | "webgpu";
export type OrtLogLevel = "verbose" | "warning" | "error";

export interface OrtEnvironmentConfig {
  device?: OrtDevice;
  logLevel?: OrtLogLevel;
  providers?: string[];
}

export interface OrtEnvironment {
  device: OrtDevice;
  logLevel: OrtLogLevel;
  providers: string[];
  initialized: boolean;
  init: () => Promise<void>;
}

/**
 * Minimal Onnx Runtime bootstrapper. This is intentionally dependency-light: callers can pass
 * a custom provider list when integrating with onnxruntime-web or node-ort.
 */
export async function createOrtEnvironment(
  config: OrtEnvironmentConfig = {},
): Promise<OrtEnvironment> {
  const providers = config.providers ?? (config.device === "webgpu" ? ["webgpu", "wasm"] : ["wasm"]);

  const environment: OrtEnvironment = {
    device: config.device ?? "cpu",
    logLevel: config.logLevel ?? "warning",
    providers,
    initialized: false,
    async init() {
      // Real implementation would call into the ORT API. Here we just flip a flag for consumers.
      this.initialized = true;
    },
  };

  await environment.init();
  return environment;
}
