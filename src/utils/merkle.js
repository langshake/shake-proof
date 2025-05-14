import { createHash } from 'crypto';

/**
 * Deterministically stringify an object with sorted keys (recursively).
 * @param {any} obj
 * @returns {string}
 */
export function stableStringify(obj) {
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

/**
 * Calculate the SHA-256 checksum of a module JSON, excluding the checksum field at the top level only, using stable stringify.
 * @param {object|array} modJson
 * @returns {string} hex string
 */
export function calculateModuleChecksum(modJson) {
  const filtered = Object.fromEntries(Object.entries(modJson).filter(([k]) => k !== 'checksum'));
  const jsonStr = stableStringify(filtered);
  return createHash('sha256').update(jsonStr).digest('hex');
}

/**
 * Calculate a simple Merkle root from an array of hex string leaves (checksums).
 * @param {string[]} leaves
 * @returns {string} Merkle root as hex string
 */
export function calculateMerkleRoot(leaves) {
  if (leaves.length === 0) return '';
  let level = leaves.slice();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        const hash = createHash('sha256')
          .update(level[i] + level[i + 1])
          .digest('hex');
        next.push(hash);
      } else {
        const hash = createHash('sha256')
          .update(level[i] + level[i])
          .digest('hex');
        next.push(hash);
      }
    }
    level = next;
  }
  return level[0];
}

/**
 * Given an array of modules ({ path, hash }), returns { modulePaths, hashes, merkleRoot }
 * Always sorts by path for determinism.
 * @param {Array<{path: string, hash: string}>} modules
 * @returns {{ modulePaths: string[], hashes: string[], merkleRoot: string }}
 */
export function prepareMerkleIndex(modules) {
  const sorted = [...modules].sort((a, b) => a.path.localeCompare(b.path));
  const modulePaths = sorted.map(m => m.path);
  const hashes = sorted.map(m => m.hash);
  const merkleRoot = calculateMerkleRoot(hashes);
  return { modulePaths, hashes, merkleRoot };
} 