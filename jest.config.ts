import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: { jsx: 'react-jsx' },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Mock @react-pdf/renderer y exceljs (ESM / binarios — no ejecutables en Jest)
    '^@react-pdf/renderer$': '<rootDir>/__mocks__/react-pdf-renderer.ts',
    '^exceljs$':             '<rootDir>/__mocks__/exceljs.ts',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  clearMocks: true,
}

export default config
