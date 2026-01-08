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

export { ResetSTTLogic } from "./reset-stt-logic.js";
export type {
  ResetReason,
  ResetSTTOptions,
  ResetStats,
} from "./reset-stt-logic.js";

export { VADController } from "./vad-controller.js";
export type { VADControllerOptions } from "./vad-controller.js";

export { STTLogic } from "./stt-logic.js";
export type {
  STTLogicOptions,
  WordUpdateCallback,
  MicTimeUpdateCallback,
  RestartMetricsCallback,
  VadCallbacks,
} from "./stt-logic.js";
