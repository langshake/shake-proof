# TASK.md

## ✅ Completed

* Finalize LangShake benchmark project scope and architecture
* Define benchmark criteria and constraints in ./planning.md
* Clarify that all schema validation includes Merkle tree verification
* Confirm Selenium + browser drivers are required for dynamic website rendering
* Implement traditional crawler (static/dynamic Schema.org extraction)
* Add Vitest tests for traditional crawler (static, edge, Selenium fallback)
* Implement LangShake crawler with real checksum and Merkle root validation (TDD, realistic fixtures)
* Add Vitest tests for LangShake crawler (checksum, Merkle, error handling)
* Create fresh project directory: `mkdir langshake-benchmark`
* Initialize Git repo and Node project: `git init && npm init -y`
* Install required dependencies:
  * Core: `axios`, `cheerio`, `minimist`, `bottleneck`, `robots-parser`
  * Rendering: `selenium-webdriver`, `chromedriver`, `geckodriver`
  * Dev: `vitest`
* Create the following directory layout:

```
src/
  crawlers/
    traditional.js
    langshake.js
  benchmark/
    compare.js
  cli/
    menu.js
  index.js
scripts/
  fix_chromedriver.js
tests/
  fixtures/
  *.test.js
```

* Benchmark engine implementation in `compare.js`:
  * Design input/output interfaces
  * Implement benchmark runner function
  * Add schema normalization and comparison logic
  * Integrate trust/integrity validation
  * Aggregate and format results for output
  * Expose benchmark via CLI and SDK (SDK part)
  * Write and run universal happy path test for the benchmark engine
  * Document benchmark usage and results (update README.md)
  * The benchmark engine now includes the fetch of `.well-known/llm.json` (timed as file 0) and all module JSONs in the timed LangShake crawl phase, for fair comparison. The progress bar for LangShake shows `.well-known/llm.json` as file 0, followed by all module files. Timing display is flexible and always shows seconds with up to 3 decimals, and minutes/hours as needed. Documentation (README.md, planning.md) has been updated to reflect these changes.
* All planned edge/failure case tests for runDomainBenchmark (benchmark engine):
  * `.llm.json` missing (404 or network error)
  * `.llm.json` malformed (invalid JSON or missing modules array)
  * Module fetch fails (404 or network error for a module)
  * Module JSON malformed (invalid JSON)
  * Module missing `mainEntityOfPage`, `url`, and `@id`
  * Traditional crawler fails for a URL (network error, timeout, etc.)
  * Schema mismatch between traditional and LangShake for a page
  * Some modules succeed, some fail (partial success)
  * Duplicate `mainEntityOfPage` values in modules
* Add concurrency support to full-domain crawl (traditional crawler) via p-limit
  * CLI now supports --concurrency argument and interactive prompt (default: 5)
  * Applies to both sitemap and link-based crawling
  * Fully tested (expected, edge, and failure cases)
  * Documented in README.md
* **Universal extraction logic and test refactor for traditional.js (2024-05-02):**
  * Extraction now covers JSON-LD, Microdata, RDFa (with vocab inheritance), and React/Next.js patterns
  * Deduplication and strict schema.org domain matching (no false positives)
  * All tests use real Cheerio (no mocking)
  * Edge/failure cases for all extraction methods are covered
  * README updated to reflect new logic and test coverage
* **Universal output and comparison (2025-05-02):**
  * Both LangShake and traditional outputs are now arrays of schema objects with the last element as a checksum object, matching the protocol.
  * Benchmark engine and all tests compare arrays directly (excluding the checksum object).
  * All documentation and test suites updated to reflect this universal, protocol-compliant format.
* Block image loading in Selenium for traditional crawler to speed up crawling (2024-06-08)
* **Security fix: axios vulnerability CVE-2025-58754 (2025-01-27):**
  * Updated package.json axios version from ^1.9.0 to ^1.12.0 (minimum secure version)
  * Verified axios version 1.12.2 is installed (exceeds minimum required 1.12.0)
  * Confirmed no axios vulnerabilities found via `npm audit`
  * All tests passing with updated axios version requirement
  * Package.json now explicitly requires secure axios version to prevent security warnings
  * **Added comprehensive URL validation to prevent data: URL DoS attacks:**
    * Created `src/utils/urlValidation.js` with `validateUrl()` and `validateUrls()` functions
    * Blocks all `data:` URLs regardless of MIME type or payload size
    * Only allows HTTP, HTTPS, and `file:` protocols for safe crawling
    * Updated CLI menu to validate URLs before processing (both interactive and command-line modes)
    * Added comprehensive test suite with 11 security-focused test cases
    * Updated README.md with security features documentation
    * Prevents CVE-2025-58754 exploitation even if malicious URLs are provided

---

## 🔨 Current Tasks (as of 2025-05-02)

### 🧠 Develop Core Modules

* [x] `traditional.js`:

  * Extract schema from static, dynamic HTML and Next.js using Cheerio + Selenium
  * **Tests implemented with Vitest**
* [x] `langshake.js`:

  * Fetch and parse `.well-known/llm.json`
  * Download and verify each JSON file via checksum and Merkle tree
  * **Real checksum and Merkle root validation, TDD with realistic fixtures**
* [x] `compare.js`:

  * Run both methods and compare:
    * Speed per page
    * Schema structure match
    * Trust score (checksum + Merkle root pass/fail)
  * [x] **Design input/output interfaces for the benchmark engine**
  * [x] **Implement the benchmark runner function**
  * [x] **Add schema normalization and comparison logic**
  * [x] **Integrate trust/integrity validation**
  * [x] **Aggregate and format results for output**
  * [x] **Expose benchmark via CLI and SDK (SDK part)**
  * [x] **Write and run universal happy path test for the benchmark engine**
  * [x] **Document benchmark usage and results (update README.md)**
  * [x] **Edge/failure case tests for runDomainBenchmark:**
    * [x] `.llm.json` missing (404 or network error)
    * [x] `.llm.json` malformed (invalid JSON or missing modules array)
    * [x] Module fetch fails (404 or network error for a module)
    * [x] Module JSON malformed (invalid JSON)
    * [x] Module missing `mainEntityOfPage`, `url`, and `@id`
    * [x] Traditional crawler fails for a URL (network error, timeout, etc.)
    * [x] Schema mismatch between traditional and LangShake for a page
    * [x] Some modules succeed, some fail (partial success)
    * [x] Duplicate `mainEntityOfPage` values in modules
    * [ ] Extra URLs crawled not present in LangShake modules (future: if supporting broader crawling)
* [ ] If `.well-known/llm.json` is missing or not available, abort crawling and provide a clear message that the website is not LangShake ready. (2024-06-09)

### 💻 CLI and SDK

* [x] `menu.js`: Interactive CLI for selecting URLs, methods, and output (benchmark integration)
  * [x] Design CLI menu flow (prompt for URL or domain [default], method [default: both], output format)
  * [x] Support both interactive (menu-driven) and direct (argument-based) usage
  * [x] Validate user input (URL/domain, method, etc.) and provide helpful error messages
  * [x] Integrate with benchmark engine (`compare.js`) to run benchmarks based on user input
  * [x] Allow selection of:
    * [x] Single URL or domain (default)
    * [x] Method: `traditional`, `langshake`, or `both` (default: both)
    * [x] Output format: human-readable or JSON
    * [x] Output file (optional, for JSON results)
    * [x] Concurrency (optional, for full-domain crawl)
  * [x] Display results in a clear, user-friendly format (table, summary, etc.)
  * [x] Support output to file (optional, for JSON results)
* [x] `index.js`: SDK interface exposing all commands programmatically (CLI part)
  * [x] Expose all CLI commands programmatically via SDK
  * [x] Ensure SDK functions are well-documented and easy to use in other Node.js scripts
* [x] `package.json`: Define bin commands and scripts
  * [x] Add CLI bin entry to `package.json` (e.g., "bin": { "shakeproof": "./src/cli/menu.js" })
  * [x] Ensure CLI is executable after install/link (`npm link`)
* [x] Build Shakeproof CLI for benchmarking traditional and LangShake protocol web scraping (2025-05-02)
* [x] Update `