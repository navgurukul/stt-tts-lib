import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type PluginOption } from "vite";
import { speechAssetsPlugin } from "speech-to-speech/vite";

const sampleRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Piper TTS + neural VAD (STS) need /ort/ and /vad/ at dev, preview, and build time.
 */
export default defineConfig({
  root: sampleRoot,

  // Monorepo `file:..` link: library types reference root `vite`, this app uses its own copy.
  plugins: [
    speechAssetsPlugin({ copyForProduction: true }) as PluginOption,
  ],

  server: {
    port: 3000,
    open: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    fs: {
      allow: [sampleRoot, path.join(sampleRoot, "..")],
    },
  },

  preview: {
    port: 3000,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },

  optimizeDeps: {
    include: ["onnxruntime-web", "@realtimex/piper-tts-web"],
    esbuildOptions: {
      target: "esnext",
    },
  },

  worker: {
    format: "es",
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
  },

  assetsInclude: ["**/*.wasm", "**/*.onnx"],
});
