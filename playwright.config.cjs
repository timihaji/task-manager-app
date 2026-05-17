// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './scripts',
  testMatch: '**/*.spec.cjs',
  timeout: 30000,
  use: {
    headless: true,
    baseURL: 'http://localhost:5174',
  },
  reporter: [['line']],
});
