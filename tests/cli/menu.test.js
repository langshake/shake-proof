/**
 * CLI integration tests for LangShake.
 *
 * Covers:
 *   - Argument parsing and output file generation
 *   - Debug and concurrency flags
 *   - Interactive prompt flows (including edge cases)
 *   - Error handling and fallback logic
 */

import { exec, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { describe, it, expect, afterEach } from 'vitest';

const outputFile = path.resolve('output/test-cli-output.json');
const cliPath = path.resolve('./src/cli/menu.js');

// Clean up output file after each test
afterEach(() => {
  if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
});

/**
 * Tests for CLI argument parsing, output, and error handling.
 */
describe('LangShake CLI', () => {
  /**
   * Should run with valid url and method, producing a JSON output file.
   */
  it('runs with valid url and method', (done) => {
    exec(`node ${cliPath} --url https://schema.org --method traditional --output ${outputFile} --outputFormat json`, (err, stdout, stderr) => {
      expect(stderr).toBe('');
      expect(stdout).toMatch(/JSON output written to/);
      const out = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      expect(out.schemas).toBeDefined();
      expect(out.rawJsonLd).toBeUndefined();
      done();
    });
  });

  /**
   * Should fail and print usage if url is missing.
   */
  it('fails with missing url', (done) => {
    exec(`node ${cliPath} --method both`, (err, stdout, stderr) => {
      expect(stderr).toMatch(/Usage: node menu.js/);
      done();
    });
  });

  /**
   * Should run with invalid method and still stub output.
   */
  it('runs with invalid method (should still stub)', (done) => {
    exec(`node ${cliPath} --url https://example.com --method invalid`, (err, stdout, stderr) => {
      expect(stdout).toMatch(/Benchmark for https:\/\/example.com using method: invalid/);
      done();
    });
  });
});

/**
 * Tests for interactive CLI prompt flows, including edge cases.
 */
describe('Interactive CLI', () => {
  /**
   * Simulates a user running the CLI interactively with valid input.
   * Expects the CLI to prompt for URL, method, and output format, and to succeed.
   */
  it('runs interactively with valid input', (done) => {
    const child = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      // Respond to prompts in order
      if (output.includes('Enter the target URL or domain:')) {
        child.stdin.write('https://example.com\n');
      } else if (output.includes('Select scraping method:')) {
        child.stdin.write('\n');
      } else if (output.includes('Select output format:')) {
        child.stdin.write('\n');
      }
    });
    child.on('close', () => {
      expect(output).toMatch(/Benchmark for https:\/\/example.com using method: both/);
      done();
    });
  });

  /**
   * Simulates edge case: user enters empty URL, then valid URL.
   * Expects the CLI to prompt again for URL and then succeed.
   */
  it('prompts again on empty URL, then succeeds', (done) => {
    const child = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let urlPrompted = 0;
    child.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('Enter the target URL or domain:') && urlPrompted === 0) {
        child.stdin.write('\n'); // empty
        urlPrompted++;
      } else if (output.includes('Enter the target URL or domain:') && urlPrompted === 1) {
        child.stdin.write('https://example.com\n');
        urlPrompted++;
      } else if (output.includes('Select scraping method:')) {
        child.stdin.write('\n');
      } else if (output.includes('Select output format:')) {
        child.stdin.write('\n');
      }
    });
    child.on('close', () => {
      expect(output).toMatch(/Benchmark for https:\/\/example.com using method: both/);
      done();
    });
  });

  /**
   * Simulates failure case: user cancels (Ctrl+C or EOF).
   * Expects the CLI to exit with a non-zero code.
   */
  it('exits gracefully if user cancels', (done) => {
    const child = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('Enter the target URL or domain:')) {
        child.stdin.end(); // simulate EOF
      }
    });
    child.on('close', (code) => {
      expect(code).not.toBe(0); // Should exit with error
      done();
    });
  });
});

/**
 * Tests for CLI concurrency argument handling, including valid and fallback cases.
 */
describe('CLI concurrency argument', () => {
  const baseArgs = `--url https://schema.org --method traditional --output ${outputFile} --outputFormat json`;

  /**
   * Should run with valid concurrency values (1, 5, 20).
   */
  [1, 5, 20].forEach(concurrency => {
    it(`runs with --concurrency ${concurrency}`, (done) => {
      exec(`node ${cliPath} ${baseArgs} --concurrency ${concurrency}`, (err, stdout, stderr) => {
        expect(stderr).toBe('');
        expect(stdout).toMatch(/JSON output written to/);
        expect(fs.existsSync(outputFile)).toBe(true);
        done();
      });
    });
  });

  /**
   * Should fall back to default concurrency for invalid values (0, -3, 'foo').
   */
  [0, -3, 'foo'].forEach(concurrency => {
    it(`falls back with --concurrency ${concurrency}`, (done) => {
      exec(`node ${cliPath} ${baseArgs} --concurrency ${concurrency}`, (err, stdout, stderr) => {
        expect(stdout).toMatch(/JSON output written to/);
        expect(fs.existsSync(outputFile)).toBe(true);
        done();
      });
    });
  });
});

/**
 * Tests for interactive CLI concurrency prompt handling.
 */
describe('Interactive CLI concurrency', () => {
  /**
   * Simulates a user entering valid concurrency in interactive mode.
   */
  it('accepts valid concurrency in interactive mode', (done) => {
    const child = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('Enter the target URL or domain:')) {
        child.stdin.write('https://schema.org\n');
      } else if (output.includes('Select scraping method:')) {
        child.stdin.write('\n');
      } else if (output.includes('Select output format:')) {
        child.stdin.write('1\n'); // JSON
      } else if (output.includes('Enter output file path')) {
        child.stdin.write(`${outputFile}\n`);
      } else if (output.includes('Include raw JSON-LD blocks')) {
        child.stdin.write('n\n');
      } else if (output.includes('Max concurrent crawls?')) {
        child.stdin.write('3\n');
      }
    });
    child.on('close', () => {
      expect(fs.existsSync(outputFile)).toBe(true);
      done();
    });
  });

  /**
   * Simulates a user entering invalid concurrency, then valid value.
   * Expects the CLI to prompt again for concurrency.
   */
  it('prompts again on invalid concurrency, then accepts valid', (done) => {
    const child = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let concurrencyPrompted = 0;
    child.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('Enter the target URL or domain:')) {
        child.stdin.write('https://schema.org\n');
      } else if (output.includes('Select scraping method:')) {
        child.stdin.write('\n');
      } else if (output.includes('Select output format:')) {
        child.stdin.write('1\n');
      } else if (output.includes('Enter output file path')) {
        child.stdin.write(`${outputFile}\n`);
      } else if (output.includes('Include raw JSON-LD blocks')) {
        child.stdin.write('n\n');
      } else if (output.includes('Max concurrent crawls?') && concurrencyPrompted === 0) {
        child.stdin.write('foo\n'); // invalid
        concurrencyPrompted++;
      } else if (output.includes('Max concurrent crawls?') && concurrencyPrompted === 1) {
        child.stdin.write('2\n'); // valid
      }
    });
    child.on('close', () => {
      expect(fs.existsSync(outputFile)).toBe(true);
      done();
    });
  });
}); 