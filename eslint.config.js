import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import sortDestructureKeys from "eslint-plugin-sort-destructure-keys";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "web-ext-artifacts/**"],
  },
  js.configs.recommended,
  // Source files (React)
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      sourceType: "module",
    },
    plugins: {
      import: importPlugin,
      react,
      "react-hooks": reactHooks,
      "simple-import-sort": simpleImportSort,
      "sort-destructure-keys": sortDestructureKeys,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "max-len": ["error", { code: 120 }],
      "no-restricted-syntax": ["error", "WithStatement"],
      "no-unused-expressions": ["error", { allowTaggedTemplates: false }],
      "react-hooks/refs": "off", // False positives with wrapper functions
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
  },
  // Test files
  {
    files: ["**/*.test.js"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  // Build scripts
  {
    files: ["*.mjs", "*.js"],
    ignores: ["src/**", "static/**"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node,
      },
      sourceType: "module",
    },
    rules: {
      "sort-keys": "off",
    },
  },
  // Static JS (vanilla, no React)
  {
    files: ["static/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
      sourceType: "script",
    },
    rules: {
      "max-len": ["error", { code: 120 }],
      "no-restricted-syntax": ["error", "WithStatement"],
      "sort-keys": "off",
    },
  },
];
