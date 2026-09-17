/**
 * Default environment is node. React test files opt into jsdom with a
 * `/** @jest-environment jsdom *\/` docblock at the top of the file.
 */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'cjs', 'mjs', 'json'],
  moduleNameMapper: {
    '^cozyevent$': '<rootDir>/src/index.ts',
    '^cozyevent/react$': '<rootDir>/src/react/index.ts',
  },
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};
