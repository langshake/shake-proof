/**
 * MetricsCollector: Collects and reports resource usage metrics for crawlers.
 *
 * Usage:
 *   const metrics = new MetricsCollector();
 *   metrics.startCrawl();
 *   metrics.recordRequest({ ... });
 *   metrics.recordError({ ... });
 *   metrics.recordDiskUsage(bytes);
 *   metrics.updateConcurrency(current);
 *   metrics.finalize();
 *   const summary = metrics.getSummary();
 */
class MetricsCollector {
  constructor() {
    // Timing
    this.startTime = null;
    this.endTime = null;

    // Resource usage
    this.startMemory = null;
    this.endMemory = null;
    this.peakMemory = 0;
    this.startCPU = null;
    this.endCPU = null;
    this.cpuUserMicros = 0;
    this.cpuSystemMicros = 0;

    // Requests
    this.requests = [];
    this.totalBytesDownloaded = 0;
    this.totalBytesUploaded = 0;
    this.statusCodes = {};
    this.requestTimes = [];

    // Errors
    this.errors = [];

    // Disk usage
    this.diskUsage = 0;

    // Concurrency
    this.maxConcurrency = 0;
    this.currentConcurrency = 0;
  }

  /**
   * Start metrics collection (e.g., record start time, initial resource usage).
   */
  startCrawl() {
    this.startTime = Date.now();
    this.startMemory = process.memoryUsage();
    this.peakMemory = this.startMemory.rss;
    this.startCPU = process.cpuUsage();
  }

  /**
   * Record a single HTTP request/response.
   * @param {Object} params
   * @param {string} params.url
   * @param {string} params.method
   * @param {number} params.startTime - ms timestamp
   * @param {number} params.endTime - ms timestamp
   * @param {number} params.bytesDownloaded
   * @param {number} params.bytesUploaded
   * @param {number} params.statusCode
   */
  recordRequest({ url, method, startTime, endTime, bytesDownloaded, bytesUploaded, statusCode }) {
    this.requests.push({ url, method, startTime, endTime, bytesDownloaded, bytesUploaded, statusCode });
    this.totalBytesDownloaded += bytesDownloaded || 0;
    this.totalBytesUploaded += bytesUploaded || 0;
    this.statusCodes[statusCode] = (this.statusCodes[statusCode] || 0) + 1;
    if (typeof startTime === 'number' && typeof endTime === 'number') {
      this.requestTimes.push(endTime - startTime);
    }
    // Update peak memory
    const mem = process.memoryUsage();
    if (mem.rss > this.peakMemory) this.peakMemory = mem.rss;
  }

  /**
   * Record an error event.
   * @param {Object} params
   * @param {string} params.url
   * @param {Error|string} params.error
   */
  recordError({ url, error }) {
    this.errors.push({ url, error: this._stringifyError(error), time: Date.now() });
  }

  /**
   * Record disk usage (e.g., after writing data to disk).
   * @param {number} bytes
   */
  recordDiskUsage(bytes) {
    this.diskUsage += bytes;
  }

  /**
   * Update current concurrency (number of parallel requests).
   * @param {number} current
   */
  updateConcurrency(current) {
    this.currentConcurrency = current;
    if (current > this.maxConcurrency) this.maxConcurrency = current;
  }

  /**
   * Finalize metrics collection (e.g., record end time, final resource usage).
   */
  finalize() {
    this.endTime = Date.now();
    this.endMemory = process.memoryUsage();
    this.endCPU = process.cpuUsage();
    this.cpuUserMicros = this.endCPU.user - (this.startCPU ? this.startCPU.user : 0);
    this.cpuSystemMicros = this.endCPU.system - (this.startCPU ? this.startCPU.system : 0);
    // Update peak memory one last time
    const mem = process.memoryUsage();
    if (mem.rss > this.peakMemory) this.peakMemory = mem.rss;
  }

  /**
   * Get a summary of all collected metrics.
   * @returns {Object}
   */
  getSummary() {
    const durationMs = (this.endTime && this.startTime) ? (this.endTime - this.startTime) : null;
    const avgRequestTime = this.requestTimes.length
      ? this.requestTimes.reduce((a, b) => a + b, 0) / this.requestTimes.length
      : null;
    const rps = durationMs && this.requests.length ? (this.requests.length / (durationMs / 1000)) : null;
    return {
      timing: {
        start: this.startTime,
        end: this.endTime,
        durationMs,
      },
      cpu: {
        userMicros: this.cpuUserMicros,
        systemMicros: this.cpuSystemMicros,
      },
      memory: {
        start: this.startMemory,
        end: this.endMemory,
        peakRss: this.peakMemory,
      },
      requests: {
        total: this.requests.length,
        statusCodes: this.statusCodes,
        avgRequestTimeMs: avgRequestTime,
        rps,
        totalBytesDownloaded: this.totalBytesDownloaded,
        totalBytesUploaded: this.totalBytesUploaded,
      },
      errors: {
        total: this.errors.length,
        details: this.errors,
      },
      disk: {
        totalBytes: this.diskUsage,
      },
      concurrency: {
        max: this.maxConcurrency,
      },
    };
  }

  /**
   * Convert an error to a string for reporting.
   * @private
   * @param {Error|string|undefined} error
   * @returns {string}
   */
  _stringifyError(error) {
    if (typeof error === 'undefined') return '';
    if (typeof error === 'string') return error;
    if (error && typeof error.toString === 'function') return error.toString();
    return String(error);
  }
}

export { MetricsCollector }; 