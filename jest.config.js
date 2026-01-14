import { createDefaultPreset } from "ts-jest";

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
export default {
  testEnvironment: "jsdom",
  "moduleNameMapper": { "\\.(css|less)$": "<rootDir>/__mocks__/styleMock.js" },
  transform: {
    ...tsJestTransformCfg,
  },
  setupFilesAfterEnv: [
    "<rootDir>/setupTests.ts"
  ]
};