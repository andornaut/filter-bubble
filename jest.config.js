module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.js'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}', '<rootDir>/src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  moduleFileExtensions: ['js', 'jsx', 'json'],
  collectCoverageFrom: ['src/**/*.{js,jsx}', '!src/**/*.test.{js,jsx}', '!src/test-setup.js'],
};
