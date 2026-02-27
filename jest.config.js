module.exports = {
  moduleNameMapper: {
    "^statezero/src$": "<rootDir>/node_modules/statezero/src/index.js",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.js$": "babel-jest",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!@testing-library|lodash-es|statezero)",
  ],
};
