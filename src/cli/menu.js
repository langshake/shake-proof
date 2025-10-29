#!/usr/bin/env node
import minimist from 'minimist';
import { runBenchmark } from '../index.js';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { discoverDomainUrls } from '../crawlers/traditional.js';
import pLimit from 'p-limit';
import { execSync } from 'child_process';
import { validateUrl } from '../utils/urlValidation.js';

/**
 * LangShake CLI entry point for benchmarking web scraping methods.
 *
 * Usage:
 *   node menu.js --url <target_url> --method <traditional|langshake|both>
 */

/**
 * Extracts the domain from a URL string.
 * @param {string} urlStr - The URL string.
 * @returns {string} The domain name or 'output' if invalid.
 */
function getDomainFromUrl(urlStr) {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return 'output';
  }
}

/**
 * Resolves the output file path, ensuring the directory exists.
 * @param {string} outputFile - File path or name.
 * @param {string} url - Associated URL.
 * @returns {string} Absolute output file path.
 */
function resolveOutputFilePath(outputFile, url) {
  const outputDir = path.resolve('./output');
  if (!outputFile) {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    return path.join(outputDir, `${getDomainFromUrl(url)}.json`);
  }
  const isAbsolute = path.isAbsolute(outputFile);
  const hasDir = path.dirname(outputFile) !== '.';
  let resolvedPath = isAbsolute || hasDir ? path.resolve(outputFile) : path.join(outputDir, outputFile);
  const parentDir = path.dirname(resolvedPath);
  if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
  return resolvedPath;
}

/**
 * Prompts the user for CLI options interactively.
 * @returns {Promise<object>} The CLI options.
 */
async function promptUser() {
  const questions = [
    {
      type: 'input',
      name: 'url',
      message: 'Enter the target URL or domain:',
      validate: input => {
        if (!input || !input.trim()) return 'URL/domain is required.';
        const validation = validateUrl(input.trim());
        return validation.isValid ? true : validation.error;
      }
    },
    {
      type: 'list',
      name: 'method',
      message: 'Select scraping method:',
      choices: [
        { name: 'Both (default)', value: 'both' },
        { name: 'Traditional', value: 'traditional' },
        { name: 'LangShake', value: 'langshake' }
      ],
      default: 0
    },
    {
      type: 'input',
      name: 'outputFile',
      message: 'Enter output file name or path (optional, default: ./output/<domain>.json):',
      validate: input => !input || input.trim() ? true : 'File path cannot be empty.'
    },
    {
      type: 'input',
      name: 'concurrency',
      message: 'Max concurrent crawls? (default: 5)',
      default: '5',
      validate: input => {
        const n = parseInt(input, 10);
        return (!input || (Number.isInteger(n) && n > 0)) ? true : 'Concurrency must be a positive integer.';
      }
    },
    {
      type: 'input',
      name: 'maxPages',
      message: 'Max pages to crawl? (default: unlimited)',
      default: '',
      validate: input => {
        if (!input) return true;
        const n = parseInt(input, 10);
        return (Number.isInteger(n) && n > 0) ? true : 'Max pages must be a positive integer.';
      }
    }
  ];
  const answers = await inquirer.prompt(questions);
  answers.concurrency = parseInt(answers.concurrency, 10) || 5;
  if (answers.maxPages) answers.maxPages = parseInt(answers.maxPages, 10);
  return answers;
}

/**
 * Recursively removes 'rawJsonLd' fields from an object or array.
 * @param {object|array} obj - The object to clean.
 */
function stripRawJsonLd(obj) {
  if (Array.isArray(obj)) obj.forEach(stripRawJsonLd);
  else if (obj && typeof obj === 'object') {
    if ('rawJsonLd' in obj) delete obj.rawJsonLd;
    Object.values(obj).forEach(stripRawJsonLd);
  }
}

/**
 * Main CLI entry point. Parses args, runs benchmark, handles output.
 */
async function main() {
  const args = minimist(process.argv.slice(2));
  let cliOptions = {
    url: args.url || args.u,
    method: args.method || args.m || 'both',
    outputFile: args.output || args.f,
    concurrency: parseInt(args.concurrency, 10) || 5,
    maxPages: args.maxPages || args.n ? parseInt(args.maxPages || args.n, 10) : undefined
  };
  const jsonToFile = !!args.json;

  if (!cliOptions.url) {
    cliOptions = await promptUser();
    if (!cliOptions.method) cliOptions.method = 'both';
  }
  if (!cliOptions.url) {
    console.error('Usage: node menu.js --url <target_url> --method <traditional|langshake|both>');
    process.exit(1);
  }

  // Validate URL for security (prevents data: URL DoS attacks)
  const urlValidation = validateUrl(cliOptions.url);
  if (!urlValidation.isValid) {
    console.error(`❌ Invalid URL: ${urlValidation.error}`);
    process.exit(1);
  }
  if (!cliOptions.concurrency || !Number.isInteger(cliOptions.concurrency) || cliOptions.concurrency <= 0) {
    cliOptions.concurrency = 5;
  }

  try {
    let result;
    if (cliOptions.method === 'both') {
      const { runDomainBenchmark } = await import('../benchmark/compare.js');
      result = await runDomainBenchmark(cliOptions.url, {
        concurrency: cliOptions.concurrency,
        maxPages: cliOptions.maxPages,
        outputFormat: 'json',
      });
    } else if (cliOptions.method === 'traditional') {
      console.log('Performing full-domain crawl (traditional)...');
      const urls = await discoverDomainUrls(cliOptions.url);
      const limitedUrls = cliOptions.maxPages ? urls.slice(0, cliOptions.maxPages) : urls;
      console.log('Using concurrency:', cliOptions.concurrency);
      const results = new Array(limitedUrls.length);
      let count = 0;
      const limit = pLimit(cliOptions.concurrency);
      const now = () => new Date().toISOString();
      const crawlTasks = limitedUrls.map((url, i) => limit(async () => {
        const current = ++count;
        console.log(`[${now()}] [START] [${current}/${limitedUrls.length}] Crawling: ${url}`);
        try {
          const { json: j } = await runBenchmark({ url, method: 'traditional', debug: false });
          results[i] = { ...j };
          console.log(`[${now()}] [END] [${current}/${limitedUrls.length}] Crawled: ${url}`);
        } catch (err) {
          results[i] = { error: err.message };
          console.log(`[${now()}] [END] [${current}/${limitedUrls.length}] Error crawling: ${url} - ${err.message}`);
        }
      }));
      await Promise.all(crawlTasks);
      const orderedResults = limitedUrls.map((url, i) => results[i]);
      const { calculateMerkleRoot } = await import('../utils/merkle.js');
      const pageChecksums = orderedResults.map(r => r.checksum || '').filter(Boolean);
      const merkleRoot = calculateMerkleRoot(pageChecksums);
      result = { traditional: orderedResults, merkleRoot };
    } else {
      const { json: j } = await runBenchmark({ url: cliOptions.url, method: cliOptions.method, debug: false });
      result = j;
    }
    if (jsonToFile) {
      if (result && result.error) return;
      try {
        stripRawJsonLd(result);
        const resolvedPath = resolveOutputFilePath(cliOptions.outputFile, cliOptions.url);
        fs.writeFileSync(resolvedPath, JSON.stringify(result, null, 2));
        if (process.stdout.isTTY) {
          console.log(`\x1b[32m✔\x1b[0m Benchmark written to: \x1b[36m${resolvedPath}\x1b[0m`);
        }
        try {
          const baseName = path.basename(resolvedPath, '.json');
          const mdFile = path.join(path.dirname(resolvedPath), `report.${baseName}.md`);
          const scriptPath = path.resolve('src/utils/generateReport.js');
          execSync(`node ${scriptPath} ${resolvedPath} ${mdFile}`, { stdio: 'inherit' });
        } catch (err) {
          console.error('Failed to generate markdown report:', err.message);
        }
      } catch (err) {
        console.error(`Failed to write to file: ${err.message}`);
        process.exit(1);
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error('Benchmark failed:', err.message);
    process.exit(1);
  }
}

main(); 