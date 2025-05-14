# Shakeproof Benchmark CLI

**Shakeproof Benchmark CLI** is an open-source benchmarking tool designed to compare **traditional web scraping** against the **LangShake Protocol**—a new standard for AI-optimized, verifiable, structured content delivery.

> This project empowers developers, webmasters, and AI platform integrators to validate, trust, and optimize the way web data is shared with LLMs and agents.

## What Is LangShake?

**LangShake** introduces `.well-known/llm.json` and per-page JSON modules to allow any website to expose **clean**, **verifiable**, **schema.org-compliant** data—without bloating the HTML or risking misinterpretation.

This CLI measures:
- **Extraction accuracy**
- **Speed**
- **Trustworthiness** (via checksum & Merkle tree validation)
- **Real-world crawl performance** (across static and dynamic content)

## Features

### Compare Crawling Methods
- **Traditional Scraping**: Extracts Schema.org data from raw HTML (including dynamic React/Next.js content).
- **LangShake Protocol**: Uses `.well-known/llm.json` and verified JSON modules for direct data access.

### Validates Integrity
- Verifies each JSON module's **SHA-256 checksum**
- Recalculates and confirms the **Merkle root** from all modules

### Benchmarking Metrics
- Extraction time (per page and per method)
- Schema match validation
- Trust pass/fail reports
- Resource usage metrics (CPU, memory, bandwidth)

### Extensive Testing
- Fixture-driven Vitest test suite (real extraction, error cases, checksum logic)
- CLI and SDK are covered with integration and unit tests

## Installation

```bash
git clone https://github.com/langshake/shake-proof
cd shake-proof
npm install
npm link   # For global CLI access (development)
```

## Usage

### CLI

```bash
shakeproof --url https://example.com --json
```

Options:

* `--url <target>`: Required. Domain or full URL to benchmark.
* `--method <type>`: `traditional`, `langshake`, or `both` (default: both)
* `--json`: Outputs structured results as JSON
* `--output <file>`: Save output to file (default: `output/<domain>.json`)
* `--concurrency <num>`: Max parallel page fetches (default: 5)

### SDK

```js
import { runBenchmark } from 'shakeproof-benchmark';

const result = await runBenchmark({
  url: 'https://example.com',
  method: 'both',
  debug: true
});

console.log(result.json);  // Machine-readable
console.log(result.human); // Human-readable summary
```

## Output Format (JSON)

```json
{
  "domainRoot": "https://example.com",
  "pages": [
    {
      "url": "https://example.com/page1",
      "langshake": [ { /* ...schema.org data... */ } ],
      "traditional": [ { /* ...schema.org data... */ } ],
      "comparison": {
        "schemasMatch": true,
        "langshakeChecksum": "...",
        "langshakeChecksumOriginal": "...",
        "langshakeChecksumValid": true,
        "traditionalChecksum": "...",
        "traditionalChecksumMatchesLangshake": true
      }
    }
  ],
  "summary": {
    "totalPages": 8,
    "allMatch": true,
    "details": "All schemas match.",
    "merkleRootLangshake": "...",
    "merkleRootTraditional": "...",
    "merkleRootLlmJson": "...",
    "merkleRootLangshakeValid": true,
    "merkleRootTraditionalValid": true,
    "merkleRootsMatch": true
  },
  "metrics": {
    "langshake": { /* ... metrics data ... */ },
    "traditional": { /* ... metrics data ... */ }
  }
}
```

## Metrics Collected

| Category     | Metric                                                                                 |
| ------------ | --------------------------------------------------------------------------------------- |
| ⚡ Speed      | Avg page extraction time, total duration, requests per second (RPS)                    |
| 🧠 Accuracy   | Schema match (true/false), extraction correctness                                      |
| 🔐 Trust      | Checksum/Merkle root verification, validation status                                   |
| 📊 Resources  | CPU usage (user/system), memory usage (start/end/peak), network (bytes in/out), disk I/O |
| 🌐 Network    | HTTP status codes, total requests, average request time                                |
| ❗ Errors     | Error count, error details (per URL and message)                                        |
| 🧵 Concurrency| Max parallel requests observed                                                          |

## Shakeproof Benchmark Report

After each benchmark run, Shakeproof automatically generates a detailed markdown report summarizing the comparison between LangShake and traditional crawling. This report includes side-by-side metrics, performance savings, per-page checksums, and Merkle root validation, providing a clear, human-readable overview of extraction speed, resource usage, and data integrity.

See an example: [output/report.xevi.work.md](output/report.xevi.work.md)

## Architecture Overview

```
shake-proof/
├── src/
│   ├── crawlers/
│   │   ├── traditional.js    # HTML-based extraction (Cheerio + Selenium)
│   │   └── langshake.js      # JSON-based validation with Merkle tree
│   ├── benchmark/
│   │   └── compare.js        # Domain-wide and per-page benchmarking logic
│   ├── utils/
│   │   ├── generateReport.js # Markdown/HTML report generation
│   │   ├── merkle.js         # Checksum and Merkle root utilities
│   │   └── metrics.js        # Resource usage and metrics collection
│   ├── cli/
│   │   └── menu.js           # CLI entry and argument parsing
│   └── index.js              # SDK entry point (runBenchmark)
├── tests/
│   ├── crawlers/
│   │   ├── traditional.test.js
│   │   └── langshake.test.js
│   ├── benchmark/
│   │   └── compare.test.js
│   ├── utils/
│   │   ├── generateReport.test.js
│   │   └── metrics.test.js
│   ├── cli/
│   │   └── menu.test.js
│   └── fixtures/
│       ├── traditional/      # HTML fixture files for traditional crawler
│       └── langshake/        # JSON fixture files for langshake protocol
```

## Testing

Run all tests:

```bash
npm test
```

Test coverage includes:

* Traditional extraction (static + dynamic HTML)
* LangShake crawler (checksum, malformed JSON, Merkle validation)
* Benchmark engine (pass/fail cases, mixed outcomes)
* CLI user flows (mocked)
* Fixture checksum recalculation

## About the LangShake Protocol

LangShake is a dual-layer micro-standard for machine-readable web content:

* **.well-known/llm.json**: Declares site-wide structured data modules & metadata
* **Modular JSON files**: Contain pure, schema.org-compliant JSON-LD arrays with checksums
* **Merkle root validation**: Ensures integrity across modules

Learn more: [whitepaper](https://github.com/langshake/langshake.github.io/blob/master/whitepaper.md)

## Companion Tool: LangshakeIt CLI

To generate `.well-known/llm.json` and the per-page JSON-LD modules used by this benchmark tool, use our sister project: **[LangshakeIt CLI](https://github.com/langshake/langshake-it)**.

LangshakeIt is the easiest way to make your website AI- and LLM-friendly by extracting and publishing structured, verifiable data for every page.

### What It Does

- Extracts **Schema.org-compliant JSON-LD** from your built static site (no framework lock-in)
- Outputs **per-page JSON** files (with checksums) and a global `.well-known/llm.json` index
- Automatically calculates and embeds a **Merkle root** to ensure integrity
- Supports **optional LLM context** via `llm_context.json` (e.g., ethical principles, usage notes)
- Includes smart caching and auto-detection of your site's public base URL

## Get Involved

LangShake is fully open source (MIT) and community-driven.

We welcome:

* Web developers who want to expose AI-friendly content
* Toolmakers who want to integrate LangShake support
* Contributors to help expand crawler compatibility or reporting

GitHub: [github.com/langshake](https://github.com/langshake)

## Roadmap

* [ ] Add resource usage and impact profiling (CPU, memory)
* [ ] Support fallback sitemaps when `.llm.json` is missing
* [ ] Integrate with third-party SEO tools
* [ ] Submit LangShake Sitemap extension to W3C

## License

MIT — Free to use, fork, improve, and adapt.

## Thanks

This project was inspired by the growing need for **verifiable**, **trustworthy**, and **machine-optimized** content delivery. We believe LangShake can be the `robots.txt` of the AI era.