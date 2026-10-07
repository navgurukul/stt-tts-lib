/**
 * Vite plugin: serve /ort and /vad in dev & preview; optional copy on build.
 * Published as `speech-to-speech/vite` — do not copy into consumer apps.
 */

import type { Connect } from "vite";
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";

export interface SpeechAssetsPluginOptions {
  /** Copy ort + vad into build output (for static hosting after `vite build`). */
  copyForProduction?: boolean;
}

function resolvePackageRoot(root: string, packageName: string): string | null {
  let dir = path.resolve(root);
  for (let depth = 0; depth < 5; depth++) {
    const candidate = path.join(dir, "node_modules", packageName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function contentTypeFor(fileName: string): string {
  if (fileName.endsWith(".wasm")) return "application/wasm";
  if (fileName.endsWith(".mjs")) return "text/javascript";
  if (fileName.endsWith(".js")) return "text/javascript";
  if (fileName.endsWith(".json")) return "application/json";
  if (fileName.endsWith(".onnx")) return "application/octet-stream";
  return "application/octet-stream";
}

function setCorpHeaders(res: ServerResponse): void {
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cache-Control", "public, max-age=31536000");
}

function pathnameFromUrl(url: string | undefined): string {
  try {
    return new URL(url || "", "http://127.0.0.1").pathname;
  } catch {
    return url?.split("?")[0] || "";
  }
}

function isPathInside(parent: string, target: string): boolean {
  const resolvedParent = path.resolve(parent);
  const resolvedTarget = path.resolve(target);
  return (
    resolvedTarget === resolvedParent ||
    resolvedTarget.startsWith(resolvedParent + path.sep)
  );
}

function copyDirFiles(srcDir: string, destDir: string): void {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirFiles(src, dest);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dest);
    }
  }
}

function prependMiddleware(
  server: { middlewares: Connect.Server },
  handler: Connect.NextHandleFunction,
): void {
  const stack = (server.middlewares as Connect.Server & {
    stack?: Array<{ route: string; handle: Connect.NextHandleFunction }>;
  }).stack;
  if (Array.isArray(stack)) {
    stack.unshift({ route: "", handle: handler });
    return;
  }
  server.middlewares.use(handler);
}

function syncAssetsToPublic(
  projectRoot: string,
  ortDist: string | null,
  vadDist: string | null,
): void {
  if (ortDist) {
    copyDirFiles(ortDist, path.join(projectRoot, "public", "ort"));
  }
  if (vadDist) {
    copyDirFiles(vadDist, path.join(projectRoot, "public", "vad"));
  }
}

function resolveAssetDirs(projectRoot: string): {
  ortDist: string | null;
  vadDist: string | null;
} {
  const ortRoot = resolvePackageRoot(projectRoot, "onnxruntime-web");
  const vadRoot = resolvePackageRoot(projectRoot, "@ricky0123/vad-web");
  return {
    ortDist: ortRoot ? path.join(ortRoot, "dist") : null,
    vadDist: vadRoot ? path.join(vadRoot, "dist") : null,
  };
}

function createSpeechAssetsMiddleware(
  projectRoot: string,
  ortDist: string | null,
  vadDist: string | null,
) {
  return (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ): void => {
    const pathname = pathnameFromUrl(req.url);

    if (pathname.startsWith("/ort/") && ortDist) {
      const fileName = path.posix.basename(pathname);
      const ortPath = path.join(ortDist, fileName);
      if (fs.existsSync(ortPath)) {
        res.setHeader("Content-Type", contentTypeFor(fileName));
        setCorpHeaders(res);
        fs.createReadStream(ortPath).pipe(res);
        return;
      }
    }

    if (pathname.startsWith("/vad/") && vadDist) {
      const rel = pathname.slice("/vad/".length);
      const safeRel = path.posix.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
      const vadPath = path.resolve(vadDist, safeRel);
      if (
        isPathInside(vadDist, vadPath) &&
        fs.existsSync(vadPath) &&
        fs.statSync(vadPath).isFile()
      ) {
        res.setHeader("Content-Type", contentTypeFor(path.basename(vadPath)));
        setCorpHeaders(res);
        fs.createReadStream(vadPath).pipe(res);
        return;
      }
    }

    if (pathname.endsWith(".onnx") && !pathname.startsWith("/vad/")) {
      const rel = pathname.startsWith("/") ? pathname.slice(1) : pathname;
      const modelPath = path.join(projectRoot, "public", rel);
      if (fs.existsSync(modelPath)) {
        res.setHeader("Content-Type", "application/octet-stream");
        setCorpHeaders(res);
        fs.createReadStream(modelPath).pipe(res);
        return;
      }
    }

    next();
  };
}

export function speechAssetsPlugin(
  options: SpeechAssetsPluginOptions = {},
): Plugin {
  const copyForProduction = options.copyForProduction ?? false;

  let projectRoot = process.cwd();
  let ortDist: string | null = null;
  let vadDist: string | null = null;
  let buildOutDir = "dist";

  const refreshAssetPaths = (): void => {
    const dirs = resolveAssetDirs(projectRoot);
    ortDist = dirs.ortDist;
    vadDist = dirs.vadDist;
  };

  refreshAssetPaths();

  return {
    name: "speech-ort-vad-assets",
    configResolved(config) {
      projectRoot = path.resolve(config.root);
      buildOutDir = config.build.outDir;
      refreshAssetPaths();
    },
    apply(_config, env) {
      // `vite preview` uses command `serve` + configurePreviewServer.
      return (
        env.command === "serve" ||
        (env.command === "build" && copyForProduction)
      );
    },
    configureServer(server) {
      refreshAssetPaths();
      syncAssetsToPublic(projectRoot, ortDist, vadDist);
      const handler = createSpeechAssetsMiddleware(
        projectRoot,
        ortDist,
        vadDist,
      );
      // Must run before Vite's .mjs transform (post-middleware gets 404 on /ort/*).
      prependMiddleware(server, handler);
    },
    configurePreviewServer(server) {
      refreshAssetPaths();
      syncAssetsToPublic(projectRoot, ortDist, vadDist);
      prependMiddleware(
        server,
        createSpeechAssetsMiddleware(projectRoot, ortDist, vadDist),
      );
    },
    closeBundle() {
      if (!copyForProduction) return;

      const outDir = path.isAbsolute(buildOutDir)
        ? buildOutDir
        : path.join(projectRoot, buildOutDir);
      refreshAssetPaths();
      if (ortDist && fs.existsSync(ortDist)) {
        copyDirFiles(ortDist, path.join(outDir, "ort"));
      }
      if (vadDist && fs.existsSync(vadDist)) {
        copyDirFiles(vadDist, path.join(outDir, "vad"));
      }
    },
  };
}

/** @deprecated Use `speechAssetsPlugin` */
export const onnxWasmPlugin = speechAssetsPlugin;
