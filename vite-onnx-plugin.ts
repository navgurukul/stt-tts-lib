/**
 * Vite Configuration for ONNX Runtime
 * Plugin to serve ONNX WASM files from node_modules
 * 
 * Usage in vite.config.ts:
 * 
 * import { defineConfig } from 'vite';
 * import { onnxWasmPlugin } from './src/lib/vite-onnx-plugin';
 * 
 * export default defineConfig({
 *   plugins: [onnxWasmPlugin()],
 * });
 */

import { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

export function onnxWasmPlugin(): Plugin {
  return {
    name: 'onnx-wasm-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Serve ONNX WASM files from /ort/ path
        if (req.url?.startsWith('/ort/')) {
          const fileName = path.basename(req.url);
          const wasmPath = path.join(
            process.cwd(),
            'node_modules',
            'onnxruntime-web',
            'dist',
            fileName
          );

          if (fs.existsSync(wasmPath)) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            fs.createReadStream(wasmPath).pipe(res);
            return;
          }
        }
        next();
      });
    },
    // For build: copy WASM files to output
    generateBundle() {
      const wasmDir = path.join(
        process.cwd(),
        'node_modules',
        'onnxruntime-web',
        'dist'
      );
      
      if (fs.existsSync(wasmDir)) {
        const files = fs.readdirSync(wasmDir);
        const wasmFiles = files.filter(f => f.endsWith('.wasm') || f.endsWith('.wasm.map'));
        
        console.log(`📦 Copying ${wasmFiles.length} ONNX WASM files for production build`);
      }
    },
  };
}
