// Tests for runLangshakeCrawler will be regenerated from scratch.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runLangshakeCrawler } from '../../src/crawlers/langshake.js';
import { calculateMerkleRoot } from '../../src/utils/merkle.js';

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn()
  }
}));
import axios from 'axios';

/**
 * First batch: basic fetch, missing modules, fetch error
 */
describe('runLangshakeCrawler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and parses .llm.json and modules (happy path)', async () => {
    const llmJson = { modules: ['mod1.json', 'mod2.json'], verification: { merkleRoot: 'root' } };
    const mod1 = [{ foo: 1 }, { checksum: 'abc' }];
    const mod2 = [{ bar: 2 }, { checksum: 'def' }];
    axios.get.mockResolvedValueOnce({ data: llmJson });
    axios.get.mockResolvedValueOnce({ data: mod1 });
    axios.get.mockResolvedValueOnce({ data: mod2 });
    const result = await runLangshakeCrawler('https://example.com');
    expect(result.modules).toEqual([mod1, mod2]);
    expect(result.trust.modules.length).toBe(2);
    expect(result.details).toMatch(/Fetched 2 modules/);
  });

  it('handles missing modules array in .llm.json', async () => {
    const llmJson = { version: '1.0' };
    axios.get.mockResolvedValueOnce({ data: llmJson });
    const result = await runLangshakeCrawler('https://example.com');
    expect(result.modules).toEqual([]);
    expect(result.trust.modules.length).toBe(0);
    expect(result.details).toMatch(/No modules/);
  });

  it('handles error fetching .llm.json', async () => {
    axios.get.mockRejectedValueOnce(new Error('404'));
    const result = await runLangshakeCrawler('https://example.com');
    expect(result.modules).toEqual([]);
    expect(result.details).toMatch(/Could not fetch/);
  });

  it('handles invalid module JSON (not array, missing checksum)', async () => {
    const llmJson = { modules: ['mod1.json'], verification: { merkleRoot: 'root' } };
    // Not an array
    axios.get.mockResolvedValueOnce({ data: llmJson });
    axios.get.mockResolvedValueOnce({ data: { foo: 'bar' } });
    const result1 = await runLangshakeCrawler('https://example.com');
    expect(result1.modules).toEqual([]);
    expect(result1.details).toMatch(/not a valid array with checksum/);
    // Array but missing checksum
    axios.get.mockResolvedValueOnce({ data: llmJson });
    axios.get.mockResolvedValueOnce({ data: [{ foo: 1 }] });
    const result2 = await runLangshakeCrawler('https://example.com');
    expect(result2.modules).toEqual([]);
    expect(result2.details).toMatch(/not a valid array with checksum/);
  });

  it('handles checksum mismatch', async () => {
    const llmJson = { modules: ['mod1.json'], verification: { merkleRoot: 'root' } };
    const mod1 = [{ foo: 1 }, { checksum: 'bad' }];
    axios.get.mockResolvedValueOnce({ data: llmJson });
    axios.get.mockResolvedValueOnce({ data: mod1 });
    const result = await runLangshakeCrawler('https://example.com');
    expect(result.trust.modules[0].checksumValid).toBe(false);
    expect(result.details).toMatch(/Checksum mismatch/);
  });

  it('validates Merkle root (valid and invalid)', async () => {
    // Invalid case
    const llmJson = { modules: ['mod1.json', 'mod2.json'], verification: { merkleRoot: 'abc' } };
    const mod1 = [{ foo: 1 }, { checksum: 'abc' }];
    const mod2 = [{ bar: 2 }, { checksum: 'def' }];
    axios.get.mockResolvedValueOnce({ data: llmJson });
    axios.get.mockResolvedValueOnce({ data: mod1 });
    axios.get.mockResolvedValueOnce({ data: mod2 });
    const result1 = await runLangshakeCrawler('https://example.com');
    expect(result1.trust.merkleRootValid).toBe(false);
    expect(result1.details).toMatch(/Merkle root mismatch|invalid/);
    // Valid case: calculate correct root
    const checksums = ['abc', 'def'];
    const correctRoot = calculateMerkleRoot(checksums);
    const llmJson2 = { modules: ['mod1.json', 'mod2.json'], verification: { merkleRoot: correctRoot } };
    axios.get.mockResolvedValueOnce({ data: llmJson2 });
    axios.get.mockResolvedValueOnce({ data: mod1 });
    axios.get.mockResolvedValueOnce({ data: mod2 });
    const result2 = await runLangshakeCrawler('https://example.com');
    expect(result2.trust.merkleRootValid).toBe(true);
    expect(result2.details).toMatch(/Merkle root valid/);
  });

  it('handles partial module fetch failure', async () => {
    const llmJson = { modules: ['mod1.json', 'mod2.json'], verification: { merkleRoot: 'root' } };
    const mod1 = [{ foo: 1 }, { checksum: 'abc' }];
    axios.get.mockResolvedValueOnce({ data: llmJson });
    axios.get.mockResolvedValueOnce({ data: mod1 });
    axios.get.mockRejectedValueOnce(new Error('404'));
    const result = await runLangshakeCrawler('https://example.com');
    // Only the successfully fetched module array should be present
    expect(result.modules).toEqual(mod1);
    expect(result.details).toMatch(/Error fetching module/);
  });
}); 
