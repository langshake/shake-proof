// Tests for runTraditionalCrawler will be regenerated from scratch.

import { describe, it, expect } from 'vitest';
import { runTraditionalCrawler } from '../../src/crawlers/traditional.js';
import { calculateModuleChecksum } from '../../src/utils/merkle.js';
import fs from 'fs';
import path from 'path';

describe('runTraditionalCrawler', () => {
  it('extracts schema and calculates correct checksum (happy path)', async () => {
    const html = fs.readFileSync(path.join(__dirname, '../fixtures/traditional/article-and-products.html'), 'utf8');
    const schemas = [];
    const regex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        schemas.push(JSON.parse(match[1].trim()));
      } catch {}
    }
    const expectedSchemas = schemas.filter(s =>
      s['@context'] &&
      (String(s['@context']).toLowerCase().includes('schema.org') ||
        String(s['@context']).toLowerCase().includes('ogp.me/ns#'))
    );
    const fileUrl = 'file://' + path.resolve(__dirname, '../fixtures/traditional/article-and-products.html');
    const resultObj = await runTraditionalCrawler(fileUrl);
    const expected = [...expectedSchemas, { checksum: calculateModuleChecksum(expectedSchemas) }];
    expect(resultObj.result).toEqual(expected);
  });

  it('returns only checksum object if no JSON-LD present', async () => {
    const filePath = path.join(__dirname, '../fixtures/traditional/no-schema.html');
    const fileUrl = 'file://' + filePath;
    const resultObj = await runTraditionalCrawler(fileUrl);
    const emptyChecksumObj = { checksum: calculateModuleChecksum([]) };
    expect(resultObj.result).toEqual([emptyChecksumObj]);
  });

  it('extracts Organization from microdata', async () => {
    const fileUrl = 'file://' + path.resolve(__dirname, '../fixtures/traditional/microdata.html');
    const resultObj = await runTraditionalCrawler(fileUrl);
    const org = resultObj.result.find(s => s['@type'] === 'Organization');
    expect(org).toBeDefined();
    expect(org.name).toBe('Acme, Inc.');
    expect(org.url).toBe('/acme');
  });

  it('returns only checksum object for microdata with no schema.org', async () => {
    const html = '<!DOCTYPE html><html><body><div itemscope itemtype="https://not-schema.org/Other"><span itemprop="name">Test</span></div></body></html>';
    const filePath = path.join(__dirname, '../fixtures/traditional/microdata-no-schema.html');
    fs.writeFileSync(filePath, html);
    const fileUrl = 'file://' + filePath;
    const resultObj = await runTraditionalCrawler(fileUrl);
    const emptyChecksumObj = { checksum: calculateModuleChecksum([]) };
    expect(resultObj.result).toEqual([emptyChecksumObj]);
    fs.unlinkSync(filePath);
  });

  it('extracts Person and Article from RDFa', async () => {
    const fileUrl = 'file://' + path.resolve(__dirname, '../fixtures/traditional/rdfa.html');
    const resultObj = await runTraditionalCrawler(fileUrl);
    const person = resultObj.result.find(s => s['@type'] === 'Person');
    const article = resultObj.result.find(s => s['@type'] === 'Article');
    expect(person).toBeDefined();
    expect(person.name).toBe('John Doe');
    expect(article).toBeDefined();
    expect(article.headline).toBe('Test Article');
    expect(article.author).toBeDefined();
  });

  it('returns only checksum object for RDFa with no schema.org type', async () => {
    const html = '<!DOCTYPE html><html><body><div typeof="Other"><span property="name">Test</span></div></body></html>';
    const filePath = path.join(__dirname, '../fixtures/traditional/rdfa-no-schema.html');
    fs.writeFileSync(filePath, html);
    const fileUrl = 'file://' + filePath;
    const resultObj = await runTraditionalCrawler(fileUrl);
    const emptyChecksumObj = { checksum: calculateModuleChecksum([]) };
    expect(resultObj.result).toEqual([emptyChecksumObj]);
    fs.unlinkSync(filePath);
  });

  it('extracts Article from React dangerouslySetInnerHTML and WebPage from Next.js __NEXT_DATA__', async () => {
    const fileUrl = 'file://' + path.resolve(__dirname, '../fixtures/traditional/react-next.html');
    const resultObj = await runTraditionalCrawler(fileUrl);
    const article = resultObj.result.find(s => s['@type'] === 'Article');
    const webpage = resultObj.result.find(s => s['@type'] === 'WebPage');
    expect(article).toBeDefined();
    expect(article.name).toBe('Test Article');
    expect(webpage).toBeDefined();
    expect(webpage.name).toBe('Test Page');
  });

  it('returns only checksum object for React/Next.js with no schema.org', async () => {
    const html = '<!DOCTYPE html><html><body><script>{"foo": "bar"}</script></body></html>';
    const filePath = path.join(__dirname, '../fixtures/traditional/react-next-no-schema.html');
    fs.writeFileSync(filePath, html);
    const fileUrl = 'file://' + filePath;
    const resultObj = await runTraditionalCrawler(fileUrl);
    const emptyChecksumObj = { checksum: calculateModuleChecksum([]) };
    expect(resultObj.result).toEqual([emptyChecksumObj]);
    fs.unlinkSync(filePath);
  });
});
