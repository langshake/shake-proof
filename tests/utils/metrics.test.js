import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '../../src/utils/metrics.js';

describe('MetricsCollector', () => {
  let metrics;

  beforeEach(() => {
    metrics = new MetricsCollector();
  });

  it('should initialize with default values', () => {
    expect(metrics.startTime).toBeNull();
    expect(metrics.endTime).toBeNull();
    expect(metrics.startMemory).toBeNull();
    expect(metrics.endMemory).toBeNull();
    expect(metrics.peakMemory).toBe(0);
    expect(metrics.startCPU).toBeNull();
    expect(metrics.endCPU).toBeNull();
    expect(metrics.cpuUserMicros).toBe(0);
    expect(metrics.cpuSystemMicros).toBe(0);
    expect(metrics.requests).toEqual([]);
    expect(metrics.totalBytesDownloaded).toBe(0);
    expect(metrics.totalBytesUploaded).toBe(0);
    expect(metrics.statusCodes).toEqual({});
    expect(metrics.requestTimes).toEqual([]);
    expect(metrics.errors).toEqual([]);
    expect(metrics.diskUsage).toBe(0);
    expect(metrics.maxConcurrency).toBe(0);
    expect(metrics.currentConcurrency).toBe(0);
  });

  it('should set start time, memory, cpu, and peak memory on startCrawl', () => {
    metrics.startCrawl();
    expect(typeof metrics.startTime).toBe('number');
    expect(metrics.startTime).toBeGreaterThan(0);
    expect(metrics.startMemory).toBeTypeOf('object');
    expect(metrics.peakMemory).toBeGreaterThan(0);
    expect(metrics.startCPU).toBeTypeOf('object');
  });

  describe('recordRequest', () => {
    beforeEach(() => {
      metrics.startCrawl();
    });

    it('should record a typical request and update stats', () => {
      const now = Date.now();
      metrics.recordRequest({
        url: 'http://example.com',
        method: 'GET',
        startTime: now,
        endTime: now + 100,
        bytesDownloaded: 500,
        bytesUploaded: 50,
        statusCode: 200,
      });
      expect(metrics.requests.length).toBe(1);
      expect(metrics.totalBytesDownloaded).toBe(500);
      expect(metrics.totalBytesUploaded).toBe(50);
      expect(metrics.statusCodes[200]).toBe(1);
      expect(metrics.requestTimes.length).toBe(1);
      expect(metrics.requestTimes[0]).toBe(100);
    });

    it('should handle edge case: zero bytes and missing times', () => {
      metrics.recordRequest({
        url: 'http://example.com/zero',
        method: 'GET',
        statusCode: 404,
      });
      expect(metrics.requests.length).toBe(1);
      expect(metrics.totalBytesDownloaded).toBe(0);
      expect(metrics.totalBytesUploaded).toBe(0);
      expect(metrics.statusCodes[404]).toBe(1);
      expect(metrics.requestTimes.length).toBe(0);
    });

    it('should be robust to missing/invalid input (failure case)', () => {
      expect(() => metrics.recordRequest({})).not.toThrow();
      expect(metrics.requests.length).toBe(1);
      const req = metrics.requests[0];
      expect(req.url).toBeUndefined();
      expect(req.method).toBeUndefined();
      expect(req.statusCode).toBeUndefined();
    });
  });

  describe('recordError', () => {
    beforeEach(() => {
      metrics.startCrawl();
    });

    it('should record an error with Error object', () => {
      metrics.recordError({ url: 'http://fail.com', error: new Error('fail') });
      expect(metrics.errors.length).toBe(1);
      expect(metrics.errors[0].url).toBe('http://fail.com');
      expect(metrics.errors[0].error).toContain('fail');
      expect(typeof metrics.errors[0].time).toBe('number');
    });

    it('should record an error with a string error', () => {
      metrics.recordError({ url: 'http://fail.com/str', error: 'fail string' });
      expect(metrics.errors.length).toBe(1);
      expect(metrics.errors[0].url).toBe('http://fail.com/str');
      expect(metrics.errors[0].error).toContain('fail string');
    });

    it('should be robust to missing/invalid input (failure case)', () => {
      expect(() => metrics.recordError({})).not.toThrow();
      expect(metrics.errors.length).toBe(1);
      expect(metrics.errors[0].url).toBeUndefined();
      expect(typeof metrics.errors[0].error).toBe('string');
    });
  });

  describe('recordDiskUsage', () => {
    it('should accumulate disk usage', () => {
      metrics.recordDiskUsage(1024);
      metrics.recordDiskUsage(2048);
      expect(metrics.diskUsage).toBe(3072);
    });
    it('should handle edge cases: zero, negative, large values', () => {
      metrics.recordDiskUsage(0);
      expect(metrics.diskUsage).toBe(0);
      metrics.recordDiskUsage(-100);
      expect(metrics.diskUsage).toBe(-100);
      metrics.recordDiskUsage(1e9);
      expect(metrics.diskUsage).toBeCloseTo(1e9 - 100);
    });
  });

  describe('updateConcurrency', () => {
    it('should update current and max concurrency', () => {
      metrics.updateConcurrency(2);
      expect(metrics.currentConcurrency).toBe(2);
      expect(metrics.maxConcurrency).toBe(2);
      metrics.updateConcurrency(5);
      expect(metrics.currentConcurrency).toBe(5);
      expect(metrics.maxConcurrency).toBe(5);
      metrics.updateConcurrency(3);
      expect(metrics.currentConcurrency).toBe(3);
      expect(metrics.maxConcurrency).toBe(5);
    });
    it('should handle edge cases: zero, negative, large values', () => {
      metrics.updateConcurrency(0);
      expect(metrics.currentConcurrency).toBe(0);
      expect(metrics.maxConcurrency).toBe(0);
      metrics.updateConcurrency(-1);
      expect(metrics.currentConcurrency).toBe(-1);
      expect(metrics.maxConcurrency).toBe(0);
      metrics.updateConcurrency(10000);
      expect(metrics.currentConcurrency).toBe(10000);
      expect(metrics.maxConcurrency).toBe(10000);
    });
  });

  describe('finalize and getSummary', () => {
    it('should summarize metrics after typical use', async () => {
      metrics.startCrawl();
      const now = Date.now();
      metrics.recordRequest({
        url: 'http://example.com',
        method: 'GET',
        startTime: now,
        endTime: now + 100,
        bytesDownloaded: 500,
        bytesUploaded: 50,
        statusCode: 200,
      });
      metrics.recordError({ url: 'http://fail.com', error: 'fail' });
      metrics.recordDiskUsage(1024);
      metrics.updateConcurrency(1);
      await new Promise(r => setTimeout(r, 2));
      metrics.finalize();
      const summary = metrics.getSummary();
      expect(summary.timing.durationMs).toBeGreaterThan(0);
      expect(summary.cpu).toHaveProperty('userMicros');
      expect(summary.memory.peakRss).toBeGreaterThan(0);
      expect(summary.requests.total).toBe(1);
      expect(summary.errors.total).toBe(1);
      expect(summary.disk.totalBytes).toBe(1024);
      expect(summary.concurrency.max).toBe(1);
    });

    it('should handle edge case: no requests/errors/disk/concurrency', () => {
      metrics.startCrawl();
      metrics.finalize();
      const summary = metrics.getSummary();
      expect(summary.requests.total).toBe(0);
      expect(summary.errors.total).toBe(0);
      expect(summary.disk.totalBytes).toBe(0);
      expect(summary.concurrency.max).toBe(0);
    });

    it('should handle failure case: only errors recorded', () => {
      metrics.startCrawl();
      metrics.recordError({ url: 'http://fail.com', error: 'fail' });
      metrics.finalize();
      const summary = metrics.getSummary();
      expect(summary.requests.total).toBe(0);
      expect(summary.errors.total).toBe(1);
      expect(summary.disk.totalBytes).toBe(0);
      expect(summary.concurrency.max).toBe(0);
    });
  });
}); 