/**
 * Vite plugin to serve ONNX assets:
 * - Serve `.onnx` models from `public/models` with `application/octet-stream`
 * - Serve ONNX Runtime Web files under `/ort/*` from `node_modules/onnxruntime-web/dist`
 * Ensures this runs before SPA fallback via pre-middleware.
 */

import { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

export function onnxWasmPlugin(): Plugin {
  return {
    name: 'onnx-wasm-files',
    apply: 'serve',

    configureServer(server) {
      return () => {
        server.middlewares.use((req, res, next) => {
          const pathname = (() => {
            try {
              return new URL(req.url || '', 'http://localhost').pathname;
            } catch {
              return req.url?.split('?')[0] || '';
            }
          })();

          // Serve .onnx model files from public/models
          if (pathname.endsWith('.onnx')) {
            const rel = pathname.startsWith('/') ? pathname.slice(1) : pathname;
            const modelPath = path.join(process.cwd(), 'public', rel);

            if (fs.existsSync(modelPath)) {
              res.setHeader('Content-Type', 'application/octet-stream');
              res.setHeader('Cache-Control', 'public, max-age=31536000');
              fs.createReadStream(modelPath).pipe(res);
              return;
            } else {
              res.statusCode = 404;
              res.end(`Model file not found: ${modelPath}`);
              return;
            }
          }

          // Serve ONNX Runtime assets from /ort/
          if (pathname.startsWith('/ort/')) {
            const fileName = path.posix.basename(pathname);
            const distDir = path.join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist');
            const ortPath = path.join(distDir, fileName);

            if (fs.existsSync(ortPath)) {
              const contentType =
                fileName.endsWith('.wasm') ? 'application/wasm' :
                fileName.endsWith('.mjs') ? 'text/javascript' :
                fileName.endsWith('.js') ? 'text/javascript' :
                fileName.endsWith('.json') ? 'application/json' :
                'application/octet-stream';
              res.setHeader('Content-Type', contentType);
              res.setHeader('Cache-Control', 'public, max-age=31536000');
              fs.createReadStream(ortPath).pipe(res);
              return;
            }
          }

          next();
        });
      };
    },
  };
}
