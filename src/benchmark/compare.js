import { runTraditionalCrawler } from '../crawlers/traditional.js';
import { runLangshakeCrawler } from '../crawlers/langshake.js';
import axios from 'axios';
import { calculateModuleChecksum, calculateMerkleRoot } from '../utils/merkle.js';
import pLimit from 'p-limit';
import { MetricsCollector } from '../utils/metrics.js';

/**
 * Checks that all schema objects in the array have the same `url`.
 * @param {Array<Object>} schemas
 * @returns {boolean}
 */
function allUrlsMatch(schemas) {
  if (!Array.isArray(schemas) || schemas.length === 0) return true;
  const getUrl = obj => obj.url || obj['og:url'];
  const url = getUrl(schemas[0]);
  return schemas.every(obj => getUrl(obj) === url);
}

/**
 * Stable stringify for deep equality.
 * @param {any} obj
 * @returns {string}
 */
function stableStringify(obj) {
  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(',')}]`;
  } else if (obj && typeof obj === 'object' && obj !== null) {
    return `{${Object.keys(obj).sort().map(
      key => JSON.stringify(key) + ':' + stableStringify(obj[key])
    ).join(',')}}`;
  } else {
    return JSON.stringify(obj);
  }
}

// --- Progress/formatting helpers ---
function formatTime(seconds) {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(3)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds - mins * 60;
  if (mins < 60) return `${mins}m ${secs.toFixed(3)}s`;
  const hours = Math.floor(mins / 60);
  const minsR = mins % 60;
  return `${hours}h ${minsR}m ${secs.toFixed(3)}s`;
}
function printProgressBar(completed, total, elapsed, label = '[progress]') {
  const barLength = 24;
  const filled = Math.round((completed / total) * barLength);
  const empty = barLength - filled;
  const green = '\x1b[32m';
  const gray = '\x1b[90m';
  const reset = '\x1b[0m';
  const bar = `${green}${'█'.repeat(filled)}${gray}${'░'.repeat(empty)}${reset}`;
  process.stdout.write(`\r${label} ${bar}   ${completed}/${total} (${formatTime(elapsed)})`);
}

// --- Main Benchmark Function ---
/**
 * Runs a full-domain benchmark comparing traditional and LangShake crawlers.
 * @param {string} domainRoot
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function runDomainBenchmark(domainRoot, options = {}) {
  const {
    maxDepth = 2,
    concurrency = 4,
    outputFormat = 'json',
    timeout = 10000
  } = options;

  // Step 1: Fetch and parse .well-known/llm.json
  let llmJson;
  let llmMerkleRoot = null;
  try {
    const llmUrl = new URL('/.well-known/llm.json', domainRoot).toString();
    const res = await axios.get(llmUrl, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
    llmJson = res.data;
    llmMerkleRoot = llmJson?.verification?.merkleRoot || null;
  } catch (err) {
    if (process.stdout.isTTY && !process.env.VITEST) {
      const yellow = '\x1b[33m';
      const reset = '\x1b[0m';
      console.log(`\n${yellow}⚠️  Benchmark could not be run: This website is not LangShake ready (.well-known/llm.json not found).${reset}\n`);
    }
    return { error: 'This website is not LangShake ready: .well-known/llm.json not found.' };
  }

  // Step 2: Build list of module URLs
  const moduleUrls = [];
  if (!Array.isArray(llmJson.modules)) {
    if (process.stdout.isTTY && !process.env.VITEST) {
      const yellow = '\x1b[33m';
      const reset = '\x1b[0m';
      console.log(`\n${yellow}⚠️  Benchmark could not be run: This website is not LangShake ready (no modules found in .well-known/llm.json).${reset}\n`);
    }
    return { error: 'This website is not LangShake ready: no modules found in .well-known/llm.json.' };
  }
  if (llmJson.modules.length === 0) {
    if (process.stdout.isTTY && !process.env.VITEST) {
      const yellow = '\x1b[33m';
      const reset = '\x1b[0m';
      console.log(`\n${yellow}⚠️  Benchmark could not be run: The modules array in .well-known/llm.json is empty. Merkle root cannot be confirmed.${reset}\n`);
    }
    return { error: 'The modules array in .well-known/llm.json is empty. Merkle root cannot be confirmed.' };
  }
  for (const modPath of llmJson.modules) {
    try {
      const modUrl = new URL(modPath, domainRoot).toString();
      moduleUrls.push(modUrl);
    } catch {}
  }

  // --- PHASE 1: LangShake crawling ---
  const langshakeMetrics = new MetricsCollector();
  langshakeMetrics.startCrawl();
  const langshakeResults = [];
  let langshakeCompleted = 0;
  let langshakeCurrentConcurrency = 0;
  const spinnerFrames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let spinnerIndex = 0;
  function printLangshakeStatusList() {
    if (!process.stdout.isTTY || process.env.VITEST) return;
    const heading = '\x1b[36m[progress]\x1b[0m Pages to crawl (LangShake):';
    console.log(`\n${heading}`);
    let symbol = '\x1b[33m⠋\x1b[0m';
    if (langshakeResults[0]?.status === 'success') symbol = '\x1b[32m✔\x1b[0m';
    else if (langshakeResults[0]?.status === 'error') symbol = '\x1b[31m✖\x1b[0m';
    process.stdout.write(`  ${symbol} 0. /.well-known/llm.json\n`);
    moduleUrls.forEach((url, i) => {
      let symbol = '\x1b[33m⠋\x1b[0m';
      if (langshakeResults[i + 1]?.status === 'success') symbol = '\x1b[32m✔\x1b[0m';
      else if (langshakeResults[i + 1]?.status === 'error') symbol = '\x1b[31m✖\x1b[0m';
      process.stdout.write(`  ${symbol} ${i + 1}. ${url}\n`);
    });
    process.stdout.write('\n');
  }
  function updateLangshakeSpinnerSymbols() {
    if (!process.stdout.isTTY) return;
    process.stdout.write(`\x1b[${moduleUrls.length + 2}A`);
    process.stdout.write(`\r`);
    let symbol;
    if (langshakeResults[0]?.status === 'success') symbol = '\x1b[32m✔\x1b[0m';
    else if (langshakeResults[0]?.status === 'error') symbol = '\x1b[31m✖\x1b[0m';
    else symbol = `\x1b[33m${spinnerFrames[spinnerIndex]}\x1b[0m`;
    process.stdout.write(`  ${symbol}`);
    process.stdout.write(`\x1b[E`);
    moduleUrls.forEach((url, i) => {
      process.stdout.write(`\r`);
      let symbol;
      if (langshakeResults[i + 1]?.status === 'success') symbol = '\x1b[32m✔\x1b[0m';
      else if (langshakeResults[i + 1]?.status === 'error') symbol = '\x1b[31m✖\x1b[0m';
      else symbol = `\x1b[33m${spinnerFrames[spinnerIndex]}\x1b[0m`;
      process.stdout.write(`  ${symbol}`);
      process.stdout.write(`\x1b[E`);
    });
    process.stdout.write(`\x1b[1B`);
  }
  printLangshakeStatusList();
  const langshakeStartTime = Date.now();
  let langshakeAnimationTimer;
  if (process.stdout.isTTY && !process.env.VITEST) {
    langshakeAnimationTimer = setInterval(() => {
      spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
      updateLangshakeSpinnerSymbols();
      printProgressBar(langshakeCompleted, moduleUrls.length + 1, (Date.now() - langshakeStartTime) / 1000);
    }, 100);
  }
  const langshakeLimit = pLimit(concurrency);
  // Step 1: Fetch llm.json as file 0 (timed)
  try {
    const llmUrl = new URL('/.well-known/llm.json', domainRoot).toString();
    const reqStart = Date.now();
    const res = await axios.get(llmUrl, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
    const reqEnd = Date.now();
    langshakeMetrics.recordRequest({
      url: llmUrl,
      method: 'GET',
      startTime: reqStart,
      endTime: reqEnd,
      bytesDownloaded: Buffer.byteLength(JSON.stringify(res.data), 'utf-8'),
      bytesUploaded: 0,
      statusCode: res.status
    });
    const llmJson = res.data;
    langshakeResults[0] = {
      status: 'success',
      url: llmUrl,
      data: llmJson
    };
    langshakeCompleted++;
    moduleUrls.length = 0;
    if (Array.isArray(llmJson.modules)) {
      for (const modPath of llmJson.modules) {
        try {
          const modUrl = new URL(modPath, domainRoot).toString();
          moduleUrls.push(modUrl);
        } catch {}
      }
    }
  } catch (err) {
    langshakeMetrics.recordError({ url: '/.well-known/llm.json', error: err });
    langshakeResults[0] = { status: 'error', url: '/.well-known/llm.json' };
    langshakeCompleted++;
    if (process.stdout.isTTY && !process.env.VITEST && langshakeAnimationTimer) {
      clearInterval(langshakeAnimationTimer);
      updateLangshakeSpinnerSymbols();
      printProgressBar(langshakeCompleted, moduleUrls.length + 1, (Date.now() - langshakeStartTime) / 1000, '[complete]');
      console.log(`\n[complete] All pages crawled in ${formatTime((Date.now() - langshakeStartTime) / 1000)}`);
    }
    langshakeMetrics.finalize();
    return { error: 'Failed to fetch .well-known/llm.json', metrics: { langshake: langshakeMetrics.getSummary() } };
  }
  // Step 2: Fetch and process each module (timed)
  await Promise.all(moduleUrls.map((modUrl, idx) => langshakeLimit(async () => {
    langshakeCurrentConcurrency++;
    langshakeMetrics.updateConcurrency(langshakeCurrentConcurrency);
    try {
      const reqStart = Date.now();
      const modRes = await axios.get(modUrl, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
      const reqEnd = Date.now();
      langshakeMetrics.recordRequest({
        url: modUrl,
        method: 'GET',
        startTime: reqStart,
        endTime: reqEnd,
        bytesDownloaded: Buffer.byteLength(JSON.stringify(modRes.data), 'utf-8'),
        bytesUploaded: 0,
        statusCode: modRes.status
      });
      const modJson = modRes.data;
      let langshakeSchemasArr = [];
      let langshakeChecksumOriginal = null;
      let canonicalUrl = null;
      if (typeof modJson !== 'object' || modJson === null) {
        const errMsg = `[LangShake] Malformed schema object for module ${modUrl}: expected array or object, got ${typeof modJson}`;
        langshakeMetrics.recordError({ url: modUrl, error: errMsg });
        langshakeResults[idx + 1] = { status: 'error', url: modUrl };
        langshakeCompleted++;
        return;
      }
      if (
        Array.isArray(modJson) &&
        modJson.length > 1 &&
        typeof modJson[modJson.length - 1] === 'object' &&
        modJson[modJson.length - 1] !== null &&
        Object.keys(modJson[modJson.length - 1]).length === 1 &&
        'checksum' in modJson[modJson.length - 1]
      ) {
        langshakeChecksumOriginal = modJson[modJson.length - 1].checksum;
        langshakeSchemasArr = modJson.slice(0, -1).filter(obj => obj.url || obj['og:url']);
        canonicalUrl = modJson[0].url || modJson[0]['og:url'] || null;
      } else if (Array.isArray(modJson)) {
        langshakeSchemasArr = modJson.filter(obj => obj.url || obj['og:url']);
        canonicalUrl = modJson[0]?.url || modJson[0]?.['og:url'] || null;
      } else if (modJson && typeof modJson === 'object') {
        if (modJson.url || modJson['og:url']) {
          langshakeSchemasArr = [modJson];
          canonicalUrl = modJson.url || modJson['og:url'] || null;
        }
        if (modJson.checksum) langshakeChecksumOriginal = modJson.checksum;
      }
      if (!allUrlsMatch(langshakeSchemasArr)) {
        throw new Error(
          `[LangShake] Schema array for module ${modUrl} contains objects with differing 'url' fields. All schemas in a module must have the same url.`
        );
      }
      langshakeResults[idx + 1] = {
        status: 'success',
        url: canonicalUrl,
        langshake: langshakeSchemasArr,
        langshakeChecksumOriginal
      };
      langshakeCompleted++;
    } catch (err) {
      langshakeMetrics.recordError({ url: modUrl, error: err });
      langshakeResults[idx + 1] = { status: 'error', url: modUrl };
      langshakeCompleted++;
    }
    langshakeCurrentConcurrency--;
    langshakeMetrics.updateConcurrency(langshakeCurrentConcurrency);
  })));
  if (process.stdout.isTTY && !process.env.VITEST && langshakeAnimationTimer) {
    clearInterval(langshakeAnimationTimer);
    updateLangshakeSpinnerSymbols();
    printProgressBar(langshakeCompleted, moduleUrls.length + 1, (Date.now() - langshakeStartTime) / 1000, '[complete]');
    console.log(`\n[complete] All pages crawled in ${formatTime((Date.now() - langshakeStartTime) / 1000)}`);
  }
  langshakeMetrics.finalize();

  // Build mainEntityUrls for traditional phase from langshakeResults (skip llm.json at index 0)
  const mainEntityUrls = langshakeResults.slice(1).map(r => ({ url: r.url, module: r.langshake }));

  // --- PHASE 2: Traditional crawling ---
  const traditionalMetrics = new MetricsCollector();
  traditionalMetrics.startCrawl();
  const traditionalResults = [];
  let traditionalCompleted = 0;
  let traditionalCurrentConcurrency = 0;
  function printTraditionalStatusList() {
    if (!process.stdout.isTTY || process.env.VITEST) return;
    const heading = '\x1b[36m[progress]\x1b[0m Pages to crawl (Traditional):';
    console.log(`\n${heading}`);
    mainEntityUrls.forEach((e, i) => {
      let symbol = '\x1b[33m⠋\x1b[0m';
      if (traditionalResults[i]?.status === 'success') symbol = '\x1b[32m✔\x1b[0m';
      else if (traditionalResults[i]?.status === 'error') symbol = '\x1b[31m✖\x1b[0m';
      process.stdout.write(`  ${symbol} ${i + 1}. ${e.url}\n`);
    });
    process.stdout.write('\n');
  }
  function updateTraditionalSpinnerSymbols() {
    if (!process.stdout.isTTY) return;
    process.stdout.write(`\x1b[${mainEntityUrls.length + 1}A`);
    mainEntityUrls.forEach((e, i) => {
      process.stdout.write(`\r`);
      let symbol;
      if (traditionalResults[i]?.status === 'success') symbol = '\x1b[32m✔\x1b[0m';
      else if (traditionalResults[i]?.status === 'error') symbol = '\x1b[31m✖\x1b[0m';
      else symbol = `\x1b[33m${spinnerFrames[spinnerIndex]}\x1b[0m`;
      process.stdout.write(`  ${symbol}`);
      process.stdout.write(`\x1b[E`);
    });
    process.stdout.write(`\x1b[1B`);
  }
  printTraditionalStatusList();
  const traditionalStartTime = Date.now();
  let traditionalAnimationTimer;
  if (process.stdout.isTTY && !process.env.VITEST) {
    traditionalAnimationTimer = setInterval(() => {
      spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
      updateTraditionalSpinnerSymbols();
      printProgressBar(traditionalCompleted, mainEntityUrls.length, (Date.now() - traditionalStartTime) / 1000);
    }, 100);
  }
  const traditionalLimit = pLimit(concurrency);
  await Promise.all(mainEntityUrls.map((entry, idx) => traditionalLimit(async () => {
    traditionalCurrentConcurrency++;
    traditionalMetrics.updateConcurrency(traditionalCurrentConcurrency);
    try {
      const reqStart = Date.now();
      const { result: traditionalArr, bytesDownloaded } = await runTraditionalCrawler(entry.url);
      const reqEnd = Date.now();
      traditionalMetrics.recordRequest({
        url: entry.url,
        method: 'GET',
        startTime: reqStart,
        endTime: reqEnd,
        bytesDownloaded: bytesDownloaded || 0,
        bytesUploaded: 0,
        statusCode: 200
      });
      let traditionalSchemasArr = Array.isArray(traditionalArr) ? traditionalArr : [];
      if (traditionalSchemasArr.length > 0 && traditionalSchemasArr[traditionalSchemasArr.length - 1].checksum) {
        traditionalSchemasArr = traditionalSchemasArr.slice(0, -1);
      }
      traditionalResults[idx] = {
        status: 'success',
        url: entry.url,
        traditional: traditionalSchemasArr
      };
      traditionalCompleted++;
    } catch (err) {
      traditionalMetrics.recordError({ url: entry.url, error: err });
      traditionalResults[idx] = { status: 'error', url: entry.url };
      traditionalCompleted++;
    }
    traditionalCurrentConcurrency--;
    traditionalMetrics.updateConcurrency(traditionalCurrentConcurrency);
  })));
  if (process.stdout.isTTY && !process.env.VITEST && traditionalAnimationTimer) {
    clearInterval(traditionalAnimationTimer);
    updateTraditionalSpinnerSymbols();
    printProgressBar(traditionalCompleted, mainEntityUrls.length, (Date.now() - traditionalStartTime) / 1000, '[complete]');
    console.log(`\n[complete] All pages crawled in ${formatTime((Date.now() - traditionalStartTime) / 1000)}`);
  }
  traditionalMetrics.finalize();

  // --- AGGREGATE & COMPARE ---
  const pages = mainEntityUrls.map((entry, idx) => {
    const langshake = langshakeResults[idx + 1]?.langshake || [];
    const traditional = traditionalResults[idx]?.traditional || [];
    const langshakeChecksum = calculateModuleChecksum(langshake);
    const traditionalChecksum = calculateModuleChecksum(traditional);
    const schemasMatch = stableStringify(langshake) === stableStringify(traditional);
    const langshakeChecksumOriginal = langshakeResults[idx + 1]?.langshakeChecksumOriginal || null;
    const langshakeChecksumValid = langshakeChecksumOriginal ? (langshakeChecksum === langshakeChecksumOriginal) : null;
    const traditionalChecksumMatchesLangshake = traditionalChecksum === langshakeChecksum;
    let diff = undefined;
    if (!schemasMatch) {
      const tKeys = traditional[0] ? Object.keys(traditional[0]) : [];
      const lKeys = langshake[0] ? Object.keys(langshake[0]) : [];
      const missingInTraditional = lKeys.filter(k => !tKeys.includes(k));
      const missingInLangshake = tKeys.filter(k => !lKeys.includes(k));
      diff = {
        missingInTraditional,
        missingInLangshake,
        note: 'This is a shallow diff. For deep diffs, use a JSON diff tool.'
      };
    }
    return {
      url: entry.url,
      langshake,
      traditional,
      comparison: {
        schemasMatch,
        langshakeChecksum,
        langshakeChecksumOriginal,
        langshakeChecksumValid,
        traditionalChecksum,
        traditionalChecksumMatchesLangshake,
        ...(diff ? { diff } : {})
      }
    };
  });
  const langshakeChecksums = pages.map(p => p.comparison.langshakeChecksum);
  const traditionalChecksums = pages.map(p => p.comparison.traditionalChecksum);
  const merkleRootLangshake = calculateMerkleRoot(langshakeChecksums.filter(Boolean));
  const merkleRootTraditional = calculateMerkleRoot(traditionalChecksums.filter(Boolean));
  const merkleRootLlmJson = llmMerkleRoot;
  const allMatch = pages.every(p => p.comparison.schemasMatch);
  const merkleRootLangshakeValid = merkleRootLangshake === merkleRootLlmJson;
  const merkleRootTraditionalValid = merkleRootTraditional === merkleRootLlmJson;
  const merkleRootsMatch = merkleRootLangshake === merkleRootTraditional && merkleRootLangshake === merkleRootLlmJson;
  const summary = {
    totalPages: pages.length,
    allMatch,
    details: allMatch ? 'All schemas match.' : 'Some schemas do not match.',
    merkleRootLangshake,
    merkleRootTraditional,
    merkleRootLlmJson,
    merkleRootLangshakeValid,
    merkleRootTraditionalValid,
    merkleRootsMatch
  };
  if (process.stdout.isTTY && !process.env.VITEST) {
    const green = '\x1b[32m';
    const red = '\x1b[31m';
    const yellow = '\x1b[33m';
    const reset = '\x1b[0m';
    console.log(`\n${green}--- Benchmark Summary ---${reset}\n`);
    console.log(`Domain: ${yellow}${domainRoot}${reset}`);
    console.log(`Total pages: ${summary.totalPages}`);
    console.log(`All schemas match: ${summary.allMatch ? green + '✔ Yes' + reset : red + '✖ No' + reset}`);
    console.log(`Merkle roots match: ${summary.merkleRootsMatch ? green + '✔ Yes' + reset : red + '✖ No' + reset}\n`);
    console.log(`${green}------------------------${reset}\n`);
  }
  return {
    domainRoot,
    pages,
    summary,
    metrics: {
      langshake: langshakeMetrics.getSummary(),
      traditional: traditionalMetrics.getSummary()
    }
  };
}

/**
 * Run benchmark comparison for the given URL and method.
 * @param {Object} opts
 * @param {string} opts.url
 * @param {string} opts.method
 * @returns {Promise<{speed: object, accuracy: object, trust: object, details: object}>}
 */
export async function compareBenchmarks({ url, method }) {
  const results = {};
  if (method === 'traditional' || method === 'both') {
    const start = Date.now();
    const traditional = await runTraditionalCrawler(url);
    const end = Date.now();
    results.traditional = {
      speed: end - start,
      schema: traditional.schema,
      trust: traditional.trust,
      details: traditional.details,
    };
  }
  if (method === 'langshake' || method === 'both') {
    const start = Date.now();
    const langshake = await runLangshakeCrawler(url);
    const end = Date.now();
    results.langshake = {
      speed: end - start,
      schema: langshake.schema,
      trust: langshake.trust,
      details: langshake.details,
    };
  }
  if (method === 'both' && results.traditional && results.langshake) {
    results.accuracy = {
      schemaMatch: JSON.stringify(results.traditional.schema) === JSON.stringify(results.langshake.schema),
    };
  }
  return results;
} 