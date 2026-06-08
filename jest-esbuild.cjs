const { transformSync } = require("esbuild");

// Jest transform that mirrors the production bundle: transform JSX only, never
// downlevel modern syntax. esbuild emits CommonJS so Jest's native module loader
// can consume it without experimental ESM flags.
module.exports = {
  process(source, sourcefile) {
    const { code } = transformSync(source, {
      format: "cjs",
      jsx: "automatic",
      loader: "jsx",
      sourcefile,
      sourcemap: "inline",
      target: "esnext",
    });
    return { code };
  },
};
