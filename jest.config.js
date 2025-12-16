const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "jsdom",
  "moduleNameMapper": { "\\.(css|less)$": "<rootDir>/__mocks__/styleMock.js" },
  transform: {
    ...tsJestTransformCfg,
  },
  setupFilesAfterEnv: [
    "<rootDir>/setupTests.ts"
  ]
};