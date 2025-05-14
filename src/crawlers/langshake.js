import axios from 'axios';
import { calculateModuleChecksum, calculateMerkleRoot } from '../utils/merkle.js';
import pLimit from 'p-limit';

/**
 * Fetch a URL with axios, retrying up to 3 times with 10s timeout and 500ms delay between retries.
 * @param {string} url
 * @param {object} options
 * @param {number} retries
 * @param {number} delayMs
 * @returns {Promise<import('axios').AxiosResponse>}
 */
async function axiosGetWithRetry(url, options = {}, retries = 3, delayMs = 500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const mergedHeaders = { ...(options.headers || {}), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' };
      return await axios.get(url, { ...options, headers: mergedHeaders, timeout: 10000 });
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
}

/**
 * Validate a single LangShake module: fetch, check structure, validate checksum.
 * @param {string} modPath - Module path from llm.json
 * @param {string} baseUrl - Domain root
 * @returns {Promise<{modJson: object[]|null, trust: object|null, checksum: string|null, error?: string}>}
 */
async function validateModule(modPath, baseUrl) {
  try {
    const modUrl = new URL(modPath, baseUrl).toString();
    const modRes = await axiosGetWithRetry(modUrl);
    const modJson = modRes.data;
    if (!Array.isArray(modJson) || modJson.length < 2) {
      return { modJson: null, trust: null, checksum: null, error: `Module ${modPath} is not a valid array with checksum.` };
    }
    const dataArr = modJson.slice(0, -1);
    const checksumObj = modJson[modJson.length - 1];
    if (!checksumObj || typeof checksumObj !== 'object' || !checksumObj.checksum) {
      return { modJson: null, trust: null, checksum: null, error: `Module ${modPath} missing checksum object.` };
    }
    const calculated = calculateModuleChecksum(dataArr);
    const checksum = checksumObj.checksum;
    const checksumValid = checksum === calculated;
    return {
      modJson,
      trust: { path: modPath, checksum, calculatedChecksum: calculated, checksumValid },
      checksum,
      error: checksumValid ? undefined : `Checksum mismatch for ${modPath}. `
    };
  } catch (err) {
    return { modJson: null, trust: null, checksum: null, error: `Error fetching module ${modPath}: ${err.message}. ` };
  }
}

/**
 * Fetch and validate LangShake protocol data for a domain.
 * @param {string} url - The target URL (domain root).
 * @returns {Promise<{modules: object[]|object, trust: object, details: string}>}
 */
export async function runLangshakeCrawler(url) {
  let details = '';
  let modules = [];
  let trustModules = [];
  let checksums = [];
  let merkleRoot = null;
  let calculatedMerkleRoot = null;
  let merkleRootValid = false;
  try {
    const llmUrl = new URL('/.well-known/llm.json', url).toString();
    const res = await axiosGetWithRetry(llmUrl);
    const llmJson = res.data;
    merkleRoot = llmJson?.verification?.merkleRoot || null;
    if (!Array.isArray(llmJson.modules) || llmJson.modules.length === 0) {
      details += 'No modules found in .llm.json.';
      return { modules: [], trust: { modules: [], merkleRoot, merkleRootValid: false }, details };
    }
    const limit = pLimit(5); // Safe concurrency limit
    const moduleResults = await Promise.all(
      llmJson.modules.map(modPath => limit(() => validateModule(modPath, url)))
    );
    for (const result of moduleResults) {
      if (result.modJson) {
        modules.push(result.modJson);
        trustModules.push(result.trust);
        checksums.push(result.checksum);
      }
      if (result.error) details += result.error;
    }
    calculatedMerkleRoot = calculateMerkleRoot(checksums);
    merkleRootValid = calculatedMerkleRoot === merkleRoot;
    details += merkleRootValid ? ' Merkle root valid.' : ' Merkle root mismatch or invalid.';
    details += ` Fetched ${modules.length} modules.`;
  } catch (err) {
    details += `Could not fetch .llm.json: ${err.message}`;
    return { modules: [], trust: { modules: [], merkleRoot: null, merkleRootValid: false }, details };
  }
  // If only one module, return it directly; if multiple, return array of arrays
  const output = modules.length === 1 ? modules[0] : modules;
  return {
    modules: output,
    trust: { modules: trustModules, merkleRoot, merkleRootValid },
    details
  };
} 