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
