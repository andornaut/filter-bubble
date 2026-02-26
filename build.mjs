import * as esbuild from "esbuild";
import { cpSync, rmSync, watch } from "fs";

const isProduction = process.argv.includes("--production");
const isWatch = process.argv.includes("--watch");

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

const copyStatic = () => {
  cpSync("static", "dist", { recursive: true });
  cpSync("manifest.json", "dist/manifest.json");
  cpSync("_locales", "dist/_locales", { recursive: true });
};

const watchStatic = () => {
  const watchers = [
    { path: "static", toDest: (f) => `dist/${f}` },
    { path: "_locales", toDest: (f) => `dist/_locales/${f}` },
    { path: "manifest.json", toDest: () => "dist/manifest.json" },
  ];
  watchers.forEach(({ path, toDest }) => {
    watch(path, { recursive: true }, (_, filename) => {
      const dest = toDest(filename || "");
      if (!dest) return;
      try {
        cpSync(`${path}/${filename || ""}`.replace(/\/$/, ""), dest);
        log(`Copied ${path}/${filename || ""}`);
      } catch {
        // File may have been deleted
      }
    });
  });
};

const buildOptions = {
  bundle: true,
  entryPoints: ["src/index.js"],
  format: "iife",
  jsx: "automatic",
  loader: { ".js": "jsx" },
  minify: isProduction,
  outfile: "dist/popup.js",
  plugins: isWatch
    ? [{ name: "log", setup: (b) => b.onEnd((r) => log(r.errors.length ? "Build failed" : "Build complete")) }]
    : [],
  sourcemap: !isProduction,
};

rmSync("dist", { force: true, recursive: true });
copyStatic();

const ctx = await esbuild.context(buildOptions);
if (isWatch) {
  await ctx.watch();
  watchStatic();
  console.log("Watching for changes...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log(`Build complete (${isProduction ? "production" : "development"})`);
}
