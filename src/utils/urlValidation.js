/**
 * Validates a URL to ensure it's safe for processing and not vulnerable to DoS attacks.
 * Specifically prevents data: URLs which can cause memory exhaustion in axios.
 * 
 * @param {string} url - The URL to validate
 * @returns {object} - { isValid: boolean, error?: string, protocol?: string }
 */
export function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL must be a non-empty string' };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (err) {
    return { isValid: false, error: 'Invalid URL format' };
  }

  const protocol = parsedUrl.protocol.toLowerCase();
  
  // Block data: URLs to prevent CVE-2025-58754 DoS vulnerability
  if (protocol === 'data:') {
    return { 
      isValid: false, 
      error: 'data: URLs are not supported for security reasons (prevents DoS attacks)',
      protocol 
    };
  }

  // Only allow HTTP/HTTPS and file: protocols for web crawling
  const allowedProtocols = ['http:', 'https:', 'file:'];
  if (!allowedProtocols.includes(protocol)) {
    return { 
      isValid: false, 
      error: `Protocol '${protocol}' is not supported. Only HTTP, HTTPS, and file: URLs are allowed`,
      protocol 
    };
  }

  return { isValid: true, protocol };
}

/**
 * Validates multiple URLs and returns results for each.
 * 
 * @param {string[]} urls - Array of URLs to validate
 * @returns {object[]} - Array of validation results
 */
export function validateUrls(urls) {
  if (!Array.isArray(urls)) {
    return [{ isValid: false, error: 'Input must be an array of URLs' }];
  }

  return urls.map(url => validateUrl(url));
}
