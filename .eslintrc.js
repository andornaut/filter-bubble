module.exports = {
  env: {
    browser: true,
    es2020: true,
    node: true,
    webextensions: true,
  },
  extends: ["eslint:recommended", "plugin:react/recommended", "plugin:react/jsx-runtime"],
  overrides: [
    {
      env: {
        jest: true,
      },
      files: ["**/*.test.js"],
    },
  ],
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["simple-import-sort", "import", "sort-destructure-keys", "react", "react-hooks"],
  rules: {
    "max-len": ["error", { code: 120 }],
    "no-restricted-syntax": ["error", "WithStatement"],
    "no-unused-expressions": ["error", { allowTaggedTemplates: false }],
    "react-hooks/exhaustive-deps": "warn",
    "react-hooks/rules-of-hooks": "error",
    "react/display-name": "off",
    "react/jsx-no-target-blank": "off",
    "react/no-unescaped-entities": "off",
    "react/prop-types": "off",
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
  settings: {
    react: {
      version: "detect",
    },
  },
};
