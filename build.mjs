import * as esbuild from "esbuild";
import { cpSync, rmSync, watch } from "fs";

const isProduction = process.argv.includes("--production");
const isWatch = process.argv.includes("--watch");

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

// Vanilla scripts (background, content-script) are not bundled; they are copied
// as-is to dist/js/. Test files live alongside them and must not ship.
const isShippableScript = (src) => !src.endsWith(".test.js");

const copyStatic = () => {
  cpSync("static", "dist", { recursive: true });
  cpSync("src/browser", "dist/js", {
    filter: isShippableScript,
    recursive: true,
  });
  cpSync("manifest.json", "dist/manifest.json");
  // The background reads the shipped defaults at runtime, since it cannot
  // import them.
  cpSync("src/data/websites.json", "dist/data/websites.json");
};

// Single files are watched through their directory, filtered by name: a watch
// on the file itself reports only its basename, and stops at the first save by
// an editor that replaces the file rather than writing it in place.
const watchStatic = () => {
  const watchers = [
    { path: "static", recursive: true, toDest: (f) => `dist/${f}` },
    {
      path: "src/browser",
      recursive: true,
      toDest: (f) => (isShippableScript(f) ? `dist/js/${f}` : null),
    },
    {
      path: ".",
      toDest: (f) => (f === "manifest.json" ? "dist/manifest.json" : null),
    },
    {
      path: "src/data",
      toDest: (f) => (f === "websites.json" ? "dist/data/websites.json" : null),
    },
  ];
  watchers.forEach(({ path, recursive = false, toDest }) => {
    watch(path, { recursive }, (_, filename) => {
      const dest = toDest(filename || "");
      if (!dest) {
        return;
      }
      try {
        cpSync(`${path}/${filename}`, dest);
        log(`Copied ${path}/${filename}`);
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
  // esnext: bundle and transform JSX only, never downlevel modern syntax.
  target: "esnext",
  plugins: isWatch
    ? [
        {
          name: "log",
          setup: (b) =>
            b.onEnd((r) =>
              log(r.errors.length ? "Build failed" : "Build complete"),
            ),
        },
      ]
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
  console.log(
    `Build complete (${isProduction ? "production" : "development"})`,
  );
}
