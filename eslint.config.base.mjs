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
  // Correctness rules first by name, then the ones about shape. Alphabetical
  // because sort-keys below applies to this file too.
  "array-callback-return": "error",
  "consistent-return": "error",
  curly: "error",
  "default-case-last": "error",
  "dot-notation": "error",
  // null is ignored: `x == null` is the idiom for "null or undefined", and
  // === there would stop matching undefined.
  eqeqeq: ["error", "always", { null: "ignore" }],
  "max-len": ["error", { code: 120 }],
  "no-await-in-loop": "error",
  "no-constructor-return": "error",
  "no-duplicate-imports": "error",
  "no-else-return": "error",
  "no-implicit-coercion": "error",
  "no-lonely-if": "error",
  "no-param-reassign": "error",
  "no-promise-executor-return": "error",
  "no-restricted-syntax": ["error", "WithStatement"],
  "no-self-compare": "error",
  "no-template-curly-in-string": "error",
  "no-unmodified-loop-condition": "error",
  "no-unreachable-loop": "error",
  "no-unused-expressions": ["error", { allowTaggedTemplates: false }],
  "no-useless-concat": "error",
  "no-useless-rename": "error",
  "no-useless-return": "error",
  "no-var": "error",
  "object-shorthand": "error",
  "prefer-arrow-callback": "error",
  "prefer-const": "error",
  "prefer-rest-params": "error",
  "prefer-spread": "error",
  "prefer-template": "error",
  radix: "error",
  "require-atomic-updates": "error",
  "simple-import-sort/exports": "error",
  "simple-import-sort/imports": "error",
  "sort-destructure-keys/sort-destructure-keys": "error",
  "sort-keys": "error",
  "symbol-description": "error",
  yoda: "error",
};

// Applied to build scripts, config files and browser shims: everything that runs
// to produce what ships rather than being it.
export const toolingRules = {
  ...sourceRules,
  "sort-keys": "off",
};
