/**
 * Benchmark protocol integration tests for runDomainBenchmark.
 *
 * Fixtures used:
 *   - langshake/llm.json
 *   - langshake/all-schemas.json
 *   - traditional/all-schemas.html
 *   - (inline) bad-schemas.json
 *
 * These tests verify protocol compliance, error handling, and data integrity
 * for both LangShake and traditional extraction flows.
 *
 * TODO: Add tests for empty modules array, malformed schema objects, extra fields, multiple modules, and checksum/merkle mismatches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDomainBenchmark } from '../../src/benchmark/compare.js';
import axios from 'axios';
import * as traditional from '../../src/crawlers/traditional.js';
import fs from 'fs';
import path from 'path';
import * as cheerio from "cheerio";
import { extractJsonLd } from '../../src/crawlers/traditional.js';

vi.mock('axios');
vi.mock('../../src/crawlers/traditional.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runTraditionalCrawler: vi.fn(),
  };
});

describe('runDomainBenchmark', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    traditional.runTraditionalCrawler.mockReset();
  });

  /**
   * Should handle missing .llm.json (404 or network error) gracefully.
   * Expects an error property in the result.
   */
  it('should handle missing .llm.json (404 or network error)', async () => {
    axios.get.mockImplementation(async (url) => {
      if (url.endsWith('/.well-known/llm.json')) throw new Error('404 Not Found');
      throw new Error('Should not fetch modules if llm.json is missing');
    });
    const result = await runDomainBenchmark('https://example.com');
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/llm\.json/i);
  });

  /**
   * Should handle malformed .llm.json (missing modules array).
   * Expects an error property in the result.
   */
  it('should handle malformed .llm.json (missing modules array)', async () => {
    axios.get.mockImplementation(async (url) => {
      if (url.endsWith('/.well-known/llm.json')) return { data: { verification: { merkleRoot: 'abc123' } } };
      throw new Error('Should not fetch modules if llm.json is malformed');
    });
    const result = await runDomainBenchmark('https://example.com');
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/modules/i);
  });

  /**
   * Should handle empty modules array in .llm.json.
   * Expects an error property in the result mentioning empty modules.
   */
  it('should handle empty modules array in .llm.json', async () => {
    axios.get.mockImplementation(async (url) => {
      if (url.endsWith('/.well-known/llm.json')) return { data: { modules: [], verification: { merkleRoot: 'abc123' } } };
      throw new Error('Should not fetch modules if modules array is empty');
    });
    const result = await runDomainBenchmark('https://example.com');
    expect(result).toHaveProperty('error');
    expect(result.error).toBe('The modules array in .well-known/llm.json is empty. Merkle root cannot be confirmed.');
  });

  /**
   * Happy path: should benchmark a single module with all schemas having the same url.
   * Compares arrays, checksums, and Merkle root for LangShake and Traditional extraction.
   */
  it('should benchmark a single module with all schemas having the same url (happy path)', async () => {
    const llmPath = path.join(__dirname, '../fixtures/langshake/llm.json');
    const llmJson = JSON.parse(fs.readFileSync(llmPath, 'utf8'));
    // 1. Extract the module path from llm.json
    const moduleRelPath = llmJson.modules[0].replace(/^\//, ''); // remove leading slash for path.join
    const modulePath = path.join(__dirname, '../fixtures', moduleRelPath);
    // 2. Read the module file (e.g., all-schemas.json)
    const allSchemasFixture = JSON.parse(fs.readFileSync(modulePath, 'utf8'));
    // 3. Extract the checksum from the module file
    const checksum = allSchemasFixture[allSchemasFixture.length - 1].checksum;
    const merkleRoot = llmJson.verification.merkleRoot;
    // 4. Use these values in the test and assertions
    const schemasWithoutChecksum = allSchemasFixture.slice(0, -1);

    // Parse the HTML fixture for the traditional array using extractJsonLd
    const htmlPath = path.join(__dirname, '../fixtures/traditional/all-schemas.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const $ = cheerio.load(htmlContent);
    const traditionalArray = extractJsonLd($);

    axios.get.mockImplementation(async (url) => {
      if (url.endsWith('/.well-known/llm.json')) return { data: llmJson };
      if (url.endsWith(llmJson.modules[0])) return { data: allSchemasFixture };
      throw new Error('Unknown URL: ' + url);
    });
    traditional.runTraditionalCrawler.mockImplementationOnce(async (url) => {
      return { result: traditionalArray };
    });
    const result = await runDomainBenchmark('https://example.com');
    const validPages = result.pages.filter(p => p.url);
    expect(validPages.length).toBe(1);
    expect(validPages[0].url).toBe('https://example.com/all-schemas.html');
    expect(result.summary.allMatch).toBe(true);
    expect(result.pages[0].comparison.langshakeChecksum).toBe(checksum);
    expect(result.summary.merkleRootLangshake).toBe(merkleRoot);
  });

  /**
   * Should report error if schema objects in a module have different urls.
   * Expects an error in the metrics for differing 'url' fields.
   */
  it('should report error if schema objects in a module have different urls', async () => {
    const llmJson = {
      modules: ['/langshake/bad-schemas.json'],
      verification: { merkleRoot: 'irrelevant' }
    };
    // Schemas have different urls
    const badSchemasFixture = [
      { "@context": "http://schema.org", "@type": "Article", "url": "https://example.com/page1" },
      { "@context": "http://schema.org", "@type": "Product", "url": "https://example.com/page2" },
      { "checksum": "irrelevant" }
    ];
    axios.get.mockImplementation(async (url) => {
      if (url.endsWith('/.well-known/llm.json')) return { data: llmJson };
      if (url.endsWith('/langshake/bad-schemas.json')) return { data: badSchemasFixture };
      throw new Error('Unknown URL: ' + url);
    });
    const result = await runDomainBenchmark('https://example.com');
    expect(result.metrics.langshake.errors.details[0].error).toMatch(/differing 'url' fields/);
  });

  /**
   * Should handle malformed schema objects in a module.
   * Expects an error in the metrics for malformed schema object.
   */
  it('should handle malformed schema objects in a module', async () => {
    const llmJson = {
      modules: ['/langshake/malformed-schemas.json'],
      verification: { merkleRoot: 'irrelevant' }
    };
    // Malformed: not an array or object, but a string
    const malformedSchemasFixture = "this is not a valid schema array or object";
    axios.get.mockImplementation(async (url) => {
      if (url.endsWith('/.well-known/llm.json')) return { data: llmJson };
      if (url.endsWith('/langshake/malformed-schemas.json')) return { data: malformedSchemasFixture };
      throw new Error('Unknown URL: ' + url);
    });
    const result = await runDomainBenchmark('https://example.com');
    expect(result.metrics.langshake.errors.details[0].error).toMatch(/malformed|invalid|schema/i);
  });

  /**
   * Should handle schema objects with extra fields (non-strict, lenient mode).
   * Expects no error and allMatch to be true if both sources have the same extra fields.
   */
  it('should handle schema objects with extra fields (lenient)', async () => {
    const llmPath = path.join(__dirname, '../fixtures/langshake/llm-extra-fields.json');
    const llmJson = JSON.parse(fs.readFileSync(llmPath, 'utf8'));
    const modulePath = path.join(__dirname, '../fixtures/langshake/extra-fields.json');
    const extraFieldsFixture = JSON.parse(fs.readFileSync(modulePath, 'utf8'));
    const htmlPath = path.join(__dirname, '../fixtures/traditional/extra-fields.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const $ = cheerio.load(htmlContent);
    const traditionalArray = extractJsonLd($);

    axios.get.mockImplementation(async (url) => {
      if (url.endsWith('/.well-known/llm.json')) return { data: llmJson };
      if (url.endsWith('/langshake/extra-fields.json')) return { data: extraFieldsFixture };
      throw new Error('Unknown URL: ' + url);
    });
    traditional.runTraditionalCrawler.mockImplementationOnce(async (url) => {
      return { result: traditionalArray };
    });
    const result = await runDomainBenchmark('https://example.com');
    expect(result.summary.allMatch).toBe(true);
    expect(result.summary.details).toMatch(/all schemas match/i);
    expect(result.pages[0].langshake).toEqual(result.pages[0].traditional);
  });

  /**
   * Should handle multiple modules listed in llm.json.
   * Expects no error and allMatch to be true if both sources match for all modules.
   */
  it('should handle multiple modules listed in llm.json', async () => {
    const llmPath = path.join(__dirname, '../fixtures/langshake/llm-multi-modules.json');
    const llmJson = JSON.parse(fs.readFileSync(llmPath, 'utf8'));
    const articleModule = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/langshake/article.json'), 'utf8'));
    const productsModule = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/langshake/products.json'), 'utf8'));
    const articleHtml = fs.readFileSync(path.join(__dirname, '../fixtures/traditional/article.html'), 'utf8');
    const productsHtml = fs.readFileSync(path.join(__dirname, '../fixtures/traditional/products.html'), 'utf8');
    const $article = cheerio.load(articleHtml);
    const $products = cheerio.load(productsHtml);
    const articleArray = extractJsonLd($article);
    const productsArray = extractJsonLd($products);

    axios.get.mockImplementation(async (url) => {
      if (url.endsWith('/.well-known/llm.json')) return { data: llmJson };
      if (url.endsWith('/langshake/article.json')) return { data: articleModule };
      if (url.endsWith('/langshake/products.json')) return { data: productsModule };
      throw new Error('Unknown URL: ' + url);
    });
    let callCount = 0;
    traditional.runTraditionalCrawler.mockImplementation(async (url) => {
      callCount++;
      if (url.endsWith('article.html')) return { result: articleArray };
      if (url.endsWith('products.html')) return { result: productsArray };
      throw new Error('Unknown URL: ' + url);
    });
    const result = await runDomainBenchmark('https://example.com');
    expect(result.summary.allMatch).toBe(true);
    expect(result.pages.length).toBe(2);
    expect(result.pages[0].langshake).toEqual(result.pages[0].traditional);
    expect(result.pages[1].langshake).toEqual(result.pages[1].traditional);
  });

  /**
   * Should detect checksum and merkle root mismatches.
   * Expects errors for both checksum and merkle root in the result.
   */
  it('should detect checksum and merkle root mismatches', async () => {
    const llmPath = path.join(__dirname, '../fixtures/langshake/llm-multi-modules-bad-merkle.json');
    const llmJson = JSON.parse(fs.readFileSync(llmPath, 'utf8'));
    const articleModule = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/langshake/article-bad-checksum.json'), 'utf8'));
    const productsModule = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/langshake/products.json'), 'utf8'));
    const articleHtml = fs.readFileSync(path.join(__dirname, '../fixtures/traditional/article.html'), 'utf8');
    const productsHtml = fs.readFileSync(path.join(__dirname, '../fixtures/traditional/products.html'), 'utf8');
    const $article = cheerio.load(articleHtml);
    const $products = cheerio.load(productsHtml);
    const articleArray = extractJsonLd($article);
    const productsArray = extractJsonLd($products);

    axios.get.mockImplementation(async (url) => {
      if (url.endsWith('/.well-known/llm.json')) return { data: llmJson };
      if (url.endsWith('/langshake/article-bad-checksum.json')) return { data: articleModule };
      if (url.endsWith('/langshake/products.json')) return { data: productsModule };
      throw new Error('Unknown URL: ' + url);
    });
    traditional.runTraditionalCrawler.mockImplementation(async (url) => {
      if (url.endsWith('article.html')) return { result: articleArray };
      if (url.endsWith('products.html')) return { result: productsArray };
      throw new Error('Unknown URL: ' + url);
    });
    const result = await runDomainBenchmark('https://example.com');
    // Check for checksum error in the first module
    expect(result.pages[0].comparison.langshakeChecksumValid).toBe(false);
    // Check for merkle root mismatch in the summary
    expect(result.summary.merkleRootLangshakeValid).toBe(false);
    expect(result.summary.merkleRootTraditionalValid).toBe(false);
    expect(result.summary.merkleRootsMatch).toBe(false);
  });
});
