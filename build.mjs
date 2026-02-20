import * as esbuild from "esbuild";
import { cpSync, rmSync } from "fs";

const isProduction = process.argv.includes("--production");

// Clean dist directory
rmSync("dist", { force: true, recursive: true });

// Bundle popup.js
await esbuild.build({
  bundle: true,
  entryPoints: ["src/index.js"],
  format: "iife",
  jsx: "automatic",
  loader: { ".js": "jsx" },
  minify: isProduction,
  outfile: "dist/popup.js",
  sourcemap: !isProduction,
});

cpSync("static", "dist", { recursive: true });
cpSync("manifest.json", "dist/manifest.json");
cpSync("_locales", "dist/_locales", { recursive: true });

console.log(`Build complete (${isProduction ? "production" : "development"})`);
