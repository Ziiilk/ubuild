module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  verbose: true,
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: [
        '<rootDir>/src/utils/**/*.test.ts',
        '<rootDir>/src/types/**/*.test.ts',
        '<rootDir>/src/test-utils/**/*.test.ts',
      ],
      transform: { '^.+\\.tsx?$': 'ts-jest' },
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: [
        '<rootDir>/src/core/**/*.test.ts',
        '<rootDir>/src/commands/**/*.test.ts',
        '<rootDir>/src/cli/**/*.test.ts',
        '<rootDir>/src/index.test.ts',
      ],
      transform: { '^.+\\.tsx?$': 'ts-jest' },
    },
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};