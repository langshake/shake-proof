/**
 * Unit tests for generateReport utility.
 *
 * Covers:
 *   - Markdown report generation from valid JSON and template
 *   - Error handling for invalid JSON input
 *   - Error handling for missing or invalid template
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateReport } from '../../src/utils/generateReport.js';

const tmpDir = path.resolve('output');
const jsonPath = path.join(tmpDir, 'test-report-input.json');
const mdPath = path.join(tmpDir, 'test-report-output.md');
const templatePath = path.resolve('templates/benchmark-report-template.hbs');
const backupTemplatePath = path.resolve('templates/benchmark-report-template.hbs.bak');

const minimalJson = {
  metrics: {
    langshake: {
      timing: { durationMs: 1000 },
      cpu: { userMicros: 1000, systemMicros: 0 },
      memory: { peakRss: 1024 },
      requests: { total: 1, avgRequestTimeMs: 100, rps: 1, totalBytesDownloaded: 100, statusCodes: { 200: 1 } },
      errors: { total: 0 },
      concurrency: { max: 1 }
    },
    traditional: {
      timing: { durationMs: 2000 },
      cpu: { userMicros: 2000, systemMicros: 0 },
      memory: { peakRss: 2048 },
      requests: { total: 2, avgRequestTimeMs: 200, rps: 2, totalBytesDownloaded: 200, statusCodes: { 200: 2 } },
      errors: { total: 0 },
      concurrency: { max: 2 }
    }
  }
};

/**
 * Utility: Write a minimal valid template for testing.
 */
function writeMinimalTemplate() {
  fs.writeFileSync(templatePath, 'Report: {{metrics.langshake.timing.durationMs}} vs {{metrics.traditional.timing.durationMs}}', 'utf-8');
}

let originalConsoleError;
let originalConsoleLog;

beforeEach(() => {
  originalConsoleError = console.error;
  originalConsoleLog = console.log;
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
  fs.writeFileSync(jsonPath, JSON.stringify(minimalJson), 'utf-8');
  if (fs.existsSync(templatePath)) fs.copyFileSync(templatePath, backupTemplatePath);
  writeMinimalTemplate();
});

afterEach(() => {
  if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
  if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
  if (fs.existsSync(backupTemplatePath)) fs.renameSync(backupTemplatePath, templatePath);
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
});

/**
 * Should generate a markdown report from valid JSON and template.
 */
it('generates a markdown report for valid input', async () => {
  const originalLog = console.log;
  console.log = () => {};
  await generateReport(jsonPath, mdPath);
  expect(fs.existsSync(mdPath)).toBe(true);
  const content = fs.readFileSync(mdPath, 'utf-8');
  expect(content).toMatch(/Report: 1\.00s \(1000ms\) vs 2\.00s \(2000ms\)/);
  console.log = originalLog;
});

/**
 * Should fail gracefully for empty/invalid JSON input.
 */
it('fails gracefully for invalid JSON input', async () => {
  console.error = () => {};
  fs.writeFileSync(jsonPath, '', 'utf-8');
  let errorCaught = false;
  try {
    await generateReport(jsonPath, mdPath);
  } catch (err) {
    errorCaught = true;
  }
  expect(errorCaught).toBe(true);
  expect(fs.existsSync(mdPath)).toBe(false);
});

/**
 * Should fail gracefully for missing or invalid template.
 */
it('fails gracefully for missing template', async () => {
  console.error = () => {};
  if (fs.existsSync(templatePath)) fs.unlinkSync(templatePath);
  let errorCaught = false;
  try {
    await generateReport(jsonPath, mdPath);
  } catch (err) {
    errorCaught = true;
  }
  expect(errorCaught).toBe(true);
  expect(fs.existsSync(mdPath)).toBe(false);
}); 