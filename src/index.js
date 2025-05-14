// SDK entry point for LangShake benchmark

import { compareBenchmarks } from './benchmark/compare.js';
import { runTraditionalCrawler } from './crawlers/traditional.js';

/**
 * Run a benchmark for the given URL and method.
 *
 * @param {Object} opts
 * @param {string} opts.url - The target URL to benchmark.
 * @param {string} opts.method - 'traditional', 'langshake', or 'both'.
 * @returns {Promise<{json: object}>}
 */
export async function runBenchmark({ url, method }) {
  if (method === 'traditional') {
    const result = await runTraditionalCrawler(url);
    const { rawJsonLd, ...jsonOut } = result;
    return { json: jsonOut };
  }
  // fallback to compareBenchmarks for langshake/both
  const results = await compareBenchmarks({ url, method });
  return { json: results };
} 