// esbuild resolves the CSS imports in src/index.js at build time; Jest has no
// CSS loader, so map them to an empty module to keep that entry point testable.
module.exports = {};
