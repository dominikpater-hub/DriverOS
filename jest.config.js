module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/core", "<rootDir>/shared", "<rootDir>/apps"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: [
    "core/**/*.ts",
    "shared/**/*.ts",
    "!core/**/__tests__/**",
    "!core/**/*.test.ts"
  ],
  coverageThreshold: {
    "./core/decision/": {
      branches: 90,
      functions: 100,
      lines: 95,
      statements: 95
    },
    "./core/knowledge/": {
      branches: 80,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  moduleFileExtensions: ["ts", "js", "json"]
};
