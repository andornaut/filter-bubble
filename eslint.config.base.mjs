// The lint rules every JavaScript repository here shares. Byte-identical in all
// of them: a sweep compares this file across repositories and reports any copy
// that has drifted, so edit it in ai-maintainer/lint-configs and let the sweep
// carry it, rather than here.
//
// It exports rule sets rather than finished configs because the globs differ per
// repository - one ships src/, another ergogen/footprints/, another .gs files -
// and a file that named them could not be shared. Each repository's
// eslint.config.mjs applies these to its own paths and adds what is local to it.
import simpleImportSort from "eslint-plugin-simple-import-sort";
import sortDestructureKeys from "eslint-plugin-sort-destructure-keys";

export const plugins = {
  "simple-import-sort": simpleImportSort,
  "sort-destructure-keys": sortDestructureKeys,
};

// Applied to what a repository ships. sort-keys is the reason this split exists:
// it reads well over a source file's object literals and fights build scripts,
// where argument order and option order carry meaning that alphabet does not.
export const sourceRules = {
  // Strings, template literals and regexes are exempt because wrapping one
  // means changing the code rather than reflowing it: a long URL, a fixture, or
  // an excerpt a mutation test matches against source verbatim cannot be broken
  // without concatenation that reads worse than the long line did.
  "max-len": [
    "error",
    {
      code: 120,
      ignoreRegExpLiterals: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
    },
  ],
  "no-restricted-syntax": ["error", "WithStatement"],
  "no-unused-expressions": ["error", { allowTaggedTemplates: false }],
  "simple-import-sort/exports": "error",
  "simple-import-sort/imports": "error",
  "sort-destructure-keys/sort-destructure-keys": "error",
  "sort-keys": "error",
};

// Applied to build scripts, config files and browser shims: everything that runs
// to produce what ships rather than being it.
export const toolingRules = {
  ...sourceRules,
  "sort-keys": "off",
};
