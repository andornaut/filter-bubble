import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

import { plugins, sourceRules, toolingRules } from "./eslint.config.base.mjs";

// React is local to this repository and amp-media-player: the plugins and the
// rules turned off below are about JSX, not about house style.
const reactPlugins = {
  ...plugins,
  import: importPlugin,
  react,
  "react-hooks": reactHooks,
};

const reactRules = {
  ...react.configs.recommended.rules,
  ...react.configs["jsx-runtime"].rules,
  ...reactHooks.configs.recommended.rules,
  ...sourceRules,
  "react-hooks/refs": "off", // False positives with wrapper functions
  "react/display-name": "off",
  "react/jsx-no-target-blank": "off",
  "react/no-unescaped-entities": "off",
  "react/prop-types": "off",
};

export default [
  {
    ignores: ["dist/**", "node_modules/**", "web-ext-artifacts/**"],
  },
  js.configs.recommended,
  // Source files (React)
  {
    files: ["src/**/*.js"],
    ignores: ["src/browser/**"],
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
    plugins: reactPlugins,
    rules: reactRules,
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  // Build scripts (ESM)
  {
    files: ["*.mjs", "*.js"],
    ignores: ["src/**"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node,
      },
      sourceType: "module",
    },
    plugins,
    rules: toolingRules,
  },
  // Tooling configs (CommonJS)
  {
    files: ["*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node,
      },
      sourceType: "commonjs",
    },
    plugins,
    rules: toolingRules,
  },
  // Vanilla scripts (background, content-script), no React, no bundling
  {
    files: ["src/browser/**/*.js"],
    ignores: ["src/browser/**/*.test.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
      sourceType: "script",
    },
    plugins,
    rules: toolingRules,
  },
  // Test files (last, so it overrides sourceType/globals regardless of location)
  {
    files: ["**/*.test.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jest,
        ...globals.node,
      },
      sourceType: "module",
    },
  },
];
