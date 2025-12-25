import { defineConfig } from 'vite';
import { onnxWasmPlugin } from './vite-onnx-plugin';

export default defineConfig({
  plugins: [onnxWasmPlugin()],
  server: {
    port: 8000,
    open: false,
  },
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
  },
});
