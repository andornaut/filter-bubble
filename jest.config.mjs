export default {
  moduleNameMapper: {
    "\\.css$": "<rootDir>/jest-css-stub.cjs",
    "^statezero/src$": "<rootDir>/node_modules/statezero/src/index.js",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jsdom",
  // The end-to-end suite runs under Playwright, not Jest; its files are named
  // `*.spec.js`, which Jest's default `testMatch` would otherwise pick up.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/tests/e2e/"],
  transform: {
    "^.+\\.js$": "<rootDir>/jest-esbuild.cjs",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!@testing-library|lodash-es|statezero)",
  ],
};
