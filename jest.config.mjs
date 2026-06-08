export default {
  moduleNameMapper: {
    "^statezero/src$": "<rootDir>/node_modules/statezero/src/index.js",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.js$": "<rootDir>/jest-esbuild.cjs",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!@testing-library|lodash-es|statezero)",
  ],
};
