import { defineConfig } from "vite";

/**
 * Vite configuration for stt-tts-lib consumer
 *
 * The key to making Piper TTS work in dev server is:
 * 1. Force pre-bundling of piper-tts-web and onnxruntime-web (include, not exclude)
 * 2. Set proper CORS headers for SharedArrayBuffer
 * 3. Use CDN for WASM files (configured in ort-setup.js)
 */

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    headers: {
      // Required for SharedArrayBuffer (multi-threaded WASM)
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    fs: {
      allow: [".."],
    },
  },

  optimizeDeps: {
    // INCLUDE (not exclude) - force Vite to pre-bundle these libraries
    // This bundles the worker code upfront, avoiding runtime blob Worker issues
    include: ["onnxruntime-web", "@realtimex/piper-tts-web"],
    // Required for top-level await in WASM modules
    esbuildOptions: {
      target: "esnext",
    },
  },

  // Worker configuration
  worker: {
    format: "es",
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
  },

  // Handle WASM files
  assetsInclude: ["**/*.wasm", "**/*.onnx"],
});
