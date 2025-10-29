import { describe, it, expect } from 'vitest';
import { validateUrl, validateUrls } from '../../src/utils/urlValidation.js';

describe('URL Validation Security', () => {
  describe('validateUrl', () => {
    it('should reject data: URLs to prevent CVE-2025-58754 DoS vulnerability', () => {
      const testCases = [
        'data:text/plain,Hello World',
        'data:application/json,{"test":"data"}',
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'data:text/html,<h1>Test</h1>',
        'data:application/octet-stream;base64,SGVsbG8gV29ybGQ='
      ];

      testCases.forEach(url => {
        const result = validateUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('data: URLs are not supported for security reasons');
        expect(result.protocol).toBe('data:');
      });
    });

    it('should accept valid HTTP/HTTPS URLs', () => {
      const testCases = [
        'https://example.com',
        'http://example.com',
        'https://www.example.com/path?query=value',
        'http://localhost:3000',
        'https://subdomain.example.com:8080/path'
      ];

      testCases.forEach(url => {
        const result = validateUrl(url);
        expect(result.isValid).toBe(true);
        expect(result.protocol).toMatch(/^https?:$/);
        expect(result.error).toBeUndefined();
      });
    });

    it('should accept file: URLs for local testing', () => {
      const testCases = [
        'file:///path/to/file.html',
        'file:///Users/test/file.json',
        'file:///C:/path/to/file.html'
      ];

      testCases.forEach(url => {
        const result = validateUrl(url);
        expect(result.isValid).toBe(true);
        expect(result.protocol).toBe('file:');
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject unsupported protocols', () => {
      const testCases = [
        'ftp://example.com',
        'ssh://user@example.com',
        'javascript:alert("xss")',
        'mailto:test@example.com',
        'tel:+1234567890'
      ];

      testCases.forEach(url => {
        const result = validateUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('is not supported');
        expect(result.protocol).toBeDefined();
      });
    });

    it('should handle invalid URL formats', () => {
      const testCases = [
        'not-a-url',
        'http://',
        'https://',
        '',
        null,
        undefined,
        123,
        {}
      ];

      testCases.forEach(url => {
        const result = validateUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('should handle edge cases', () => {
      // Empty string
      expect(validateUrl('').isValid).toBe(false);
      
      // Whitespace only
      expect(validateUrl('   ').isValid).toBe(false);
      
      // Very long URL (should still be valid if properly formatted)
      const longUrl = 'https://example.com/' + 'a'.repeat(1000);
      expect(validateUrl(longUrl).isValid).toBe(true);
    });
  });

  describe('validateUrls', () => {
    it('should validate multiple URLs correctly', () => {
      const urls = [
        'https://example.com',
        'data:text/plain,test',
        'http://test.com',
        'ftp://unsupported.com'
      ];

      const results = validateUrls(urls);
      
      expect(results).toHaveLength(4);
      expect(results[0].isValid).toBe(true); // https://example.com
      expect(results[1].isValid).toBe(false); // data: URL
      expect(results[2].isValid).toBe(true); // http://test.com
      expect(results[3].isValid).toBe(false); // ftp: URL
    });

    it('should handle non-array input', () => {
      const result = validateUrls('not-an-array');
      expect(result).toHaveLength(1);
      expect(result[0].isValid).toBe(false);
      expect(result[0].error).toContain('Input must be an array');
    });

    it('should handle empty array', () => {
      const results = validateUrls([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('Security-focused tests', () => {
    it('should prevent large data: URL DoS attacks', () => {
      // Simulate a large base64 payload that would cause memory exhaustion
      const largeBase64 = 'A'.repeat(1000000); // 1MB of 'A' characters
      const maliciousUrl = `data:application/octet-stream;base64,${largeBase64}`;
      
      const result = validateUrl(maliciousUrl);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('data: URLs are not supported for security reasons');
    });

    it('should prevent data: URLs with various MIME types', () => {
      const mimeTypes = [
        'text/plain',
        'application/json',
        'image/png',
        'video/mp4',
        'application/octet-stream',
        'text/html',
        'application/xml'
      ];

      mimeTypes.forEach(mimeType => {
        const url = `data:${mimeType},test`;
        const result = validateUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('data: URLs are not supported');
      });
    });
  });
});
