module.exports = {
  env: {
    browser: true,
    es2020: true,
    node: true,
    webextensions: true,
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["simple-import-sort", "import", "sort-destructure-keys"],
  rules: {
    "max-len": ["error", { code: 120 }],
    "no-restricted-syntax": ["error", "WithStatement"],
    "no-unused-expressions": ["error", { allowTaggedTemplates: true }],
    "simple-import-sort/exports": "error",
    "simple-import-sort/imports": [
      "error",
      {
        groups: [
          // External packages
          ["^@?\\w"],
          // Internal/relative imports
          ["^", "^\\."],
        ],
      },
    ],
    "sort-destructure-keys/sort-destructure-keys": ["error"],
    "sort-keys": ["error"],
  },
};
