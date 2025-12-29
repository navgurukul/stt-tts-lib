import { defineConfig } from 'vite';
import { onnxWasmPlugin } from './vite-onnx-plugin';
import * as fs from 'fs';
import * as path from 'path';

export default defineConfig({
  plugins: [
    onnxWasmPlugin(),
  ],
  server: {
    port: 5173,
    open: false,
    fs: {
      strict: false,
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    middlewareMode: false,
  },
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
  },
  // Include .onnx files as assets
  assetsInclude: ['**/*.onnx', '**/*.wasm'],
});
