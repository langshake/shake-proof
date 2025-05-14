import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import prettyMs from 'pretty-ms';
import { filesize } from 'filesize';

// --- Formatting helpers ---
const format = {
  /** Format numbers with commas and optional decimals. */
  number(num, decimals = 0) {
    if (typeof num !== 'number' || isNaN(num)) return 'N/A';
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  },
  /** Format RPS (requests per second) to 2 decimals. */
  rps(rps) {
    if (typeof rps !== 'number' || isNaN(rps)) return 'N/A';
    return rps.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  /** Format bytes as human-readable string. */
  bytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },
  /** Format CPU time (μs) to ms, s, min, h as appropriate. */
  cpuTime(micros) {
    if (typeof micros !== 'number' || isNaN(micros)) return 'N/A';
    if (micros < 1000) return `${micros} μs`;
    if (micros < 1e6) return `${(micros / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} ms`;
    if (micros < 6e7) return `${(micros / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })} s`;
    return prettyMs(micros / 1000, { compact: true });
  },
  /** Format durations. */
  duration(ms) {
    if (typeof ms !== 'number' || isNaN(ms)) return 'N/A';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 10000) return `${(ms / 1000).toFixed(2)}s (${Math.round(ms)}ms)`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return prettyMs(ms, { compact: true });
  },
  /** Format status codes as '200: 9, 404: 1' */
  statusCodes(statusCodes) {
    if (!statusCodes || typeof statusCodes !== 'object') return 'N/A';
    return Object.entries(statusCodes).map(([code, count]) => `${code}: ${count}`).join(', ');
  }
};

// --- Handlebars helpers registration ---
Handlebars.registerHelper('formatBytes', format.bytes);
Handlebars.registerHelper('add', (a, b) => (a || 0) + (b || 0));
Handlebars.registerHelper('formatNumber', format.number);
Handlebars.registerHelper('formatRps', format.rps);
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('and', function() { return Array.prototype.every.call(arguments, Boolean); });

// --- Diff/ratio helpers ---
function percentDiff(a, b) {
  if (b === 0) return 'N/A';
  return ((b - a) / b) * 100;
}
function ratio(a, b) {
  if (a === 0) return 'N/A';
  return b / a;
}
function formatPercent(val, context = '') {
  return `**~${Math.abs(Math.round(val))}% less${context ? ' ' + context : ''}**`;
}
function formatFaster(val, context = '') {
  return `**~${Math.abs(Math.round(val))}% faster${context ? ' ' + context : ''}**`;
}
function formatX(val, context = '') {
  return `**~${val.toFixed(1)}x faster${context ? ' ' + context : ''}**`;
}

/**
 * Main function to generate a benchmark report from JSON and template.
 * @param {string} jsonPath - Path to the input JSON file.
 * @param {string} outputPath - Path to the output Markdown file.
 */
export async function generateReport(jsonPath, outputPath) {
  try {
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const l = jsonData.metrics.langshake;
    const t = jsonData.metrics.traditional;
    // --- Calculate Diff / Savings for summary table ---
    const metricsDiff = {
      duration: (l.timing.durationMs && t.timing.durationMs) ? formatX(t.timing.durationMs / l.timing.durationMs) : 'N/A',
      cpu: t.cpu.userMicros || t.cpu.systemMicros ? formatPercent(percentDiff((l.cpu.userMicros || 0) + (l.cpu.systemMicros || 0), (t.cpu.userMicros || 0) + (t.cpu.systemMicros || 0)), 'CPU used') : 'N/A',
      memory: t.memory.peakRss ? formatPercent(percentDiff(l.memory.peakRss, t.memory.peakRss), 'RAM used') : 'N/A',
      bytes: t.requests.totalBytesDownloaded ? formatPercent(percentDiff(l.requests.totalBytesDownloaded, t.requests.totalBytesDownloaded), 'data') : 'N/A',
      avgRequestTime: t.requests.avgRequestTimeMs ? formatFaster(percentDiff(l.requests.avgRequestTimeMs, t.requests.avgRequestTimeMs), 'per request') : 'N/A',
      rps: (l.requests.rps && t.requests.rps) ? formatX(l.requests.rps / t.requests.rps) : 'N/A',
      requests: Math.abs(l.requests.total - t.requests.total) <= 1 ? 'Similar' : `${l.requests.total > t.requests.total ? '~' + (l.requests.total - t.requests.total) + ' more' : '~' + (t.requests.total - l.requests.total) + ' less'}`
    };
    // --- Format all numbers for the template ---
    const metricsFormatted = {
      langshake: {
        timing: { durationMs: format.duration(l.timing.durationMs) },
        cpu: {
          userMicros: format.cpuTime(l.cpu.userMicros),
          systemMicros: format.cpuTime(l.cpu.systemMicros),
          total: format.cpuTime((l.cpu.userMicros || 0) + (l.cpu.systemMicros || 0)),
        },
        memory: { peakRss: filesize(l.memory.peakRss, { round: 1 }) },
        requests: {
          total: format.number(l.requests.total),
          avgRequestTimeMs: format.duration(l.requests.avgRequestTimeMs),
          rps: format.rps(l.requests.rps),
          totalBytesDownloaded: filesize(l.requests.totalBytesDownloaded, { round: 1 }),
          statusCodes: format.statusCodes(l.requests.statusCodes),
        },
        errors: { total: format.number(l.errors.total), raw: l.errors.total },
        concurrency: { max: format.number(l.concurrency.max) },
      },
      traditional: {
        timing: { durationMs: format.duration(t.timing.durationMs) },
        cpu: {
          userMicros: format.cpuTime(t.cpu.userMicros),
          systemMicros: format.cpuTime(t.cpu.systemMicros),
          total: format.cpuTime((t.cpu.userMicros || 0) + (t.cpu.systemMicros || 0)),
        },
        memory: { peakRss: filesize(t.memory.peakRss, { round: 1 }) },
        requests: {
          total: format.number(t.requests.total),
          avgRequestTimeMs: format.duration(t.requests.avgRequestTimeMs),
          rps: format.rps(t.requests.rps),
          totalBytesDownloaded: filesize(t.requests.totalBytesDownloaded, { round: 1 }),
          statusCodes: format.statusCodes(t.requests.statusCodes),
        },
        errors: { total: format.number(t.errors.total), raw: t.errors.total },
        concurrency: { max: format.number(t.concurrency.max) },
      }
    };
    const templateStr = fs.readFileSync(path.resolve('templates/benchmark-report-template.hbs'), 'utf-8');
    const template = Handlebars.compile(templateStr);
    const report = template({ ...jsonData, metricsDiff, metrics: metricsFormatted });
    fs.writeFileSync(outputPath, report, 'utf-8');
    const green = '\x1b[32m', cyan = '\x1b[36m', reset = '\x1b[0m';
    console.log(`\n${green}✔${reset} Report generated: ${cyan}${outputPath}${reset}\n`);
  } catch (err) {
    console.error('Error generating report:', err.message);
    process.exit(1);
  }
}

// CLI usage: node src/utils/generateReport.js <input-json> <output-md>
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.length < 4) {
    console.error('Usage: node src/utils/generateReport.js <input-json> <output-md>');
    process.exit(1);
  }
  const [,, jsonPath, outputPath] = process.argv;
  generateReport(jsonPath, outputPath);
} 