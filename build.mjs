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
  alias: {
    "lodash": "lodash-es",
    "lodash/get": "lodash-es/get.js",
    "lodash/set": "lodash-es/set.js",
    "lodash/isPlainObject": "lodash-es/isPlainObject.js",
    "lodash/cloneDeepWith": "lodash-es/cloneDeepWith.js",
    "lodash/isEqualWith": "lodash-es/isEqualWith.js",
  },
});

cpSync("static", "dist", { recursive: true });
cpSync("manifest.json", "dist/manifest.json");
cpSync("_locales", "dist/_locales", { recursive: true });

console.log(`Build complete (${isProduction ? "production" : "development"})`);
