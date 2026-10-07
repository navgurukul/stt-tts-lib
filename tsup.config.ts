import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'stt/index': 'src/stt/index.ts',
    'tts/index': 'src/tts/index.ts',
    'vite/index': 'src/vite/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2020',
  outDir: 'dist',
  treeshake: true,
  bundle: true,
  splitting: false,
  external: [
    'onnxruntime-web',
    'onnxruntime-web/wasm',
    '@ricky0123/vad-web',
    '@realtimex/piper-tts-web',
  ],
  // Keep ORT/VAD as runtime imports so Vite consumers are not served a megabundle
  // with un-analyzable `import(url)` calls from onnxruntime-web.
  esbuildOptions(options) {
    options.sourcesContent = true;
    return options;
  },
  outExtension({ format }) {
    return {
      js: format === 'esm' ? '.mjs' : '.cjs',
    };
  },
});
