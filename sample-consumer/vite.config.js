import { defineConfig } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

// Serve ONNX runtime files from node_modules at /ort/*
function serveOrtFiles() {
  return {
    name: 'serve-ort-files',
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

          if (pathname.startsWith('/ort/')) {
            const fileName = path.posix.basename(pathname);
            const distDir = path.join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist');
            const ortPath = path.join(distDir, fileName);

            console.log(`[ORT] Request: ${req.url} → pathname: ${pathname}, file: ${fileName}`);

            if (fs.existsSync(ortPath)) {
              const contentType =
                fileName.endsWith('.wasm') ? 'application/wasm' :
                fileName.endsWith('.mjs') ? 'text/javascript' :
                fileName.endsWith('.js') ? 'text/javascript' :
                fileName.endsWith('.json') ? 'application/json' :
                'application/octet-stream';

              console.log(`[ORT] ✓ Serving ${fileName} with type ${contentType}`);
              res.setHeader('Content-Type', contentType);
              res.setHeader('Cache-Control', 'public, max-age=31536000');
              fs.createReadStream(ortPath).pipe(res);
              return;
            } else {
              console.log(`[ORT] ✗ File not found: ${ortPath}`);
              res.statusCode = 404;
              res.end(`ORT file not found: ${fileName}`);
              return;
            }
          }

          next();
        });
      };
    },
  };
}

export default defineConfig({
  plugins: [serveOrtFiles()],
  server: {
    port: 3000,
    open: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      // Allow serving files from the parent directory (for the .tgz)
      allow: ['..']
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
