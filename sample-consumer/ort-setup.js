// ONNX Runtime Web setup for the sample consumer
import * as ort from 'onnxruntime-web';

// Serve WASM binaries from /ort/ via Vite plugin
ort.env.wasm.wasmPaths = '/ort/';

// Make WebAudio+WASM stable in the browser
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

// Expose globally so libraries can pick it up
globalThis.ort = ort;

console.log('[Sample] ONNX Runtime configured: wasmPaths=/ort/');
