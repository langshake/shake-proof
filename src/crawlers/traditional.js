import axios from "axios";
import * as cheerio from "cheerio";
import { Builder, By } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import {
  calculateModuleChecksum,
} from "../utils/merkle.js";
import fs from "fs";

/**
 * Discover all URLs for a domain by first attempting to fetch and parse sitemap.xml.
 * If sitemap.xml is not found or cannot be parsed, fall back to crawling the site by following internal links.
 * @param {string} domainRoot - The root URL of the domain (e.g., https://example.com)
 * @returns {Promise<string[]>} List of URLs to crawl
 */
export async function discoverDomainUrls(domainRoot) {
  // Helper to recursively fetch sitemap URLs
  async function fetchSitemapUrls(
    sitemapUrl,
    collected = new Set(),
    depth = 0,
  ) {
    if (depth > 2 || collected.size >= 10) return collected;
    try {
      const res = await axios.get(sitemapUrl, { timeout: 10000, headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
      const xml = res.data;
      // Check for sitemap index
      const sitemapIndexRegex = /<sitemap>([\s\S]*?)<\/sitemap>/g;
      let sitemapMatch;
      let foundSitemap = false;
      while ((sitemapMatch = sitemapIndexRegex.exec(xml)) !== null) {
        foundSitemap = true;
        const locMatch = sitemapMatch[1].match(/<loc>([^<]+)<\/loc>/);
        if (locMatch && locMatch[1]) {
          await fetchSitemapUrls(locMatch[1], collected, depth + 1);
          if (collected.size >= 10) break;
        }
      }
      if (!foundSitemap) {
        // Not a sitemap index, extract <loc> URLs
        const locRegex = /<loc>([^<]+)<\/loc>/g;
        let match;
        while ((match = locRegex.exec(xml)) !== null) {
          collected.add(match[1]);
          if (collected.size >= 10) break;
        }
      }
    } catch (err) {
      // Ignore and continue
    }
    return collected;
  }
  // Try to fetch sitemap.xml and recursively collect up to 10 real URLs
  let sitemapUrls = [];
  try {
    const sitemapUrl = new URL("/sitemap.xml", domainRoot).toString();
    const collected = await fetchSitemapUrls(sitemapUrl);
    sitemapUrls = Array.from(collected);
    if (sitemapUrls.length > 0) {
      return sitemapUrls;
    }
  } catch (err) {
    // Ignore and fall back to crawling
  }
  // Fallback: site-wide crawl by following internal links (shallow, to avoid infinite loops)
  const visited = new Set();
  const toVisit = [domainRoot];
  const maxPages = 50; // Limit for safety
  while (toVisit.length > 0 && visited.size < maxPages) {
    const url = toVisit.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const options = new chrome.Options();
      options.addArguments("--headless"); // Optional: keep headless
      options.setUserPreferences({
        "profile.managed_default_content_settings.images": 2,
      });
      const driver = await new Builder()
        .forBrowser("chrome")
        .setChromeOptions(options)
        .build();
      // Block additional resources using CDP
      try {
        await driver.getSession(); // Ensure session is started
        await driver.sendDevToolsCommand("Network.enable");
        await driver.sendDevToolsCommand("Network.setBlockedURLs", {
          urls: [
            "*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp", "*.svg",
            "*.css", "*.woff", "*.woff2", "*.ttf", "*.otf", "*.eot",
            "*.mp3", "*.mp4", "*.webm", "*.ogg", "*.avi", "*.mov"
          ]
        });
      } catch (e) {
        // If CDP is not available, continue without blocking
      }
      await driver.get(url);
      const html = await driver
        .findElement(By.tagName("html"))
        .getAttribute("outerHTML");
      await driver.quit();
      const $ = cheerio.load(html);
      // Find all <a href> links
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        // Only follow internal links
        let absUrl;
        try {
          absUrl = new URL(href, domainRoot).toString();
        } catch {
          return;
        }
        if (
          absUrl.startsWith(domainRoot) &&
          !visited.has(absUrl) &&
          !toVisit.includes(absUrl)
        ) {
          toVisit.push(absUrl);
        }
      });
    } catch {
      // Ignore errors and continue
    }
  }
  return Array.from(visited);
}

/**
 * Fetch HTML using Selenium (dynamic crawling).
 * @param {string} url
 * @param {string} [domainRoot]
 * @returns {Promise<string>} HTML string
 */
async function fetchHtmlWithSelenium(url, domainRoot) {
  const options = new chrome.Options();
  options.addArguments("--headless");
  options.setUserPreferences({ "profile.managed_default_content_settings.images": 2 });
  const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
  try {
    try {
      await driver.getSession();
      await driver.sendDevToolsCommand("Network.enable");
      await driver.sendDevToolsCommand("Network.setBlockedURLs", {
        urls: [
          "*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp", "*.svg",
          "*.css", "*.woff", "*.woff2", "*.ttf", "*.otf", "*.eot",
          "*.mp3", "*.mp4", "*.webm", "*.ogg", "*.avi", "*.mov"
        ]
      });
    } catch {}
    await driver.get(url);
    return await driver.findElement(By.tagName("html")).getAttribute("outerHTML");
  } finally {
    await driver.quit();
  }
}

/**
 * Fetch HTML using Axios (static fallback).
 * @param {string} url
 * @returns {Promise<string>} HTML string
 */
async function fetchHtmlWithAxios(url) {
  const res = await axios.get(url, { timeout: 15000, headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
  return res.data;
}

/**
 * Extract JSON-LD data from script tags (standard and non-standard)
 * @param {CheerioStatic} $
 * @returns {Array} Array of JSON-LD objects
 */
function extractJsonLd($) {
  const results = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const content = $(element).html();
      if (!content || content.trim() === "") return;
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else {
        results.push(parsed);
      }
    } catch {}
  });
  // Also look for inline scripts that might contain JSON-LD
  $("script").each((_, element) => {
    const scriptType = $(element).attr("type");
    if (scriptType === "application/ld+json" || $(element).attr("src")) return;
    try {
      const content = $(element).html();
      if (!content || content.trim() === "") return;
      const jsonRegex =
        /{[\s\S]*?"@context"[\s\S]*?:[\s\S]*?"https?:\/\/schema\.org"[\s\S]*?}/gi;
      const matches = content.match(jsonRegex);
      if (matches) {
        for (const match of matches) {
          try {
            const parsed = JSON.parse(match);
            if (
              parsed &&
              parsed["@context"] &&
              String(parsed["@context"]).toLowerCase().includes("schema.org")
            ) {
              results.push(parsed);
            }
          } catch {}
        }
      }
    } catch {}
  });
  return results;
}

/**
 * Extract Microdata from HTML
 * @param {CheerioStatic} $
 * @returns {Array} Array of schema.org objects
 */
function extractMicrodata($) {
  const results = [];
  $("[itemscope]:not([itemprop])").each((_, element) => {
    const itemType = $(element).attr("itemtype");
    if (itemType && /https?:\/\/(www\.)?schema\.org\//i.test(itemType)) {
      const item = {};
      // Find all [itemprop] descendants whose closest [itemscope] ancestor is the current element
      $(element)
        .find("[itemprop]")
        .filter((_, propElement) => {
          // Only include if the closest [itemscope] ancestor is the current element
          const closest = $(propElement).closest("[itemscope]")[0];
          return closest === element;
        })
        .each((_, propElement) => {
          const propName = $(propElement).attr("itemprop");
          const tag = (
            propElement.tagName ||
            propElement.name ||
            ""
          ).toLowerCase();
          let propValue;
          if ((tag === "a" || tag === "link") && $(propElement).attr("href")) {
            propValue = $(propElement).attr("href");
          } else if (tag === "img" && $(propElement).attr("src")) {
            propValue = $(propElement).attr("src");
          } else if ($(propElement).attr("content")) {
            propValue = $(propElement).attr("content");
          } else {
            propValue = $(propElement).text().trim();
          }
          // Always use href for <a itemprop="url">
          if (
            propName === "url" &&
            (tag === "a" || tag === "link") &&
            $(propElement).attr("href")
          ) {
            propValue = $(propElement).attr("href");
          }
          // Collect multiple values as arrays
          if (item[propName]) {
            if (Array.isArray(item[propName])) {
              item[propName].push(propValue);
            } else {
              item[propName] = [item[propName], propValue];
            }
          } else {
            item[propName] = propValue;
          }
        });
      item["@context"] = "https://schema.org";
      if (!item["@type"] && itemType) {
        const typeMatch = itemType.match(
          /https?:\/\/(www\.)?schema\.org\/([^\/\?#]+)/i,
        );
        if (typeMatch && typeMatch[2]) {
          item["@type"] = typeMatch[2];
        }
      }
      results.push(item);
    }
  });
  // Filter: only return objects with @type and @context including 'schema.org'
  return results.filter(
    (obj) =>
      obj["@type"] &&
      obj["@context"] &&
      String(obj["@context"]).toLowerCase().includes("schema.org"),
  );
}

/**
 * Extract RDFa from HTML
 * @param {CheerioStatic} $
 * @returns {Array} Array of schema.org objects
 */
function extractRdfa($) {
  const results = [];
  $("[typeof]").each((_, element) => {
    const typeValue = $(element).attr("typeof");
    // Check for vocab or context including 'schema.org', with inheritance
    let vocab = $(element).attr("vocab");
    if (!vocab) {
      // Walk up ancestors to find vocab
      let parent = element.parent;
      while (parent && !vocab) {
        vocab = $(parent).attr && $(parent).attr("vocab");
        parent = parent.parent;
      }
    }
    if (
      (typeValue && typeValue.toLowerCase().includes("schema.org")) ||
      (vocab && vocab.toLowerCase().includes("schema.org"))
    ) {
      const item = {};
      item["@type"] = typeValue.includes(":")
        ? typeValue.split(":").pop()
        : typeValue;
      if ($(element).attr("property")) {
        const propName = $(element).attr("property").includes(":")
          ? $(element).attr("property").split(":").pop()
          : $(element).attr("property");
        item[propName] = $(element).attr("content") || $(element).text().trim();
      }
      $(element)
        .find("[property]")
        .each((_, propElement) => {
          const propName = $(propElement).attr("property").includes(":")
            ? $(propElement).attr("property").split(":").pop()
            : $(propElement).attr("property");
          let propValue =
            $(propElement).attr("content") || $(propElement).text().trim();
          if (item[propName]) {
            if (Array.isArray(item[propName])) {
              item[propName].push(propValue);
            } else {
              item[propName] = [item[propName], propValue];
            }
          } else {
            item[propName] = propValue;
          }
        });
      item["@context"] = "https://schema.org";
      results.push(item);
    }
  });
  // Filter: only return objects with @type and @context including 'schema.org'
  const filtered = results.filter(
    (obj) =>
      obj["@type"] &&
      obj["@context"] &&
      String(obj["@context"]).toLowerCase().includes("schema.org"),
  );
  return filtered;
}

/**
 * Extract Schema.org data from React/Next.js patterns
 * @param {CheerioStatic} $
 * @returns {Array} Array of schema.org objects
 */
function extractReactNext($) {
  const results = [];
  const nextDataScript = $("#__NEXT_DATA__");
  if (nextDataScript.length > 0) {
    try {
      const content = nextDataScript.html();
      if (content) {
        const parsed = JSON.parse(content);
        const findSchemaOrgObjects = (obj) => {
          if (!obj || typeof obj !== "object") return;
          if (
            obj["@context"] &&
            String(obj["@context"]).toLowerCase().includes("schema.org") &&
            obj["@type"]
          ) {
            results.push(obj);
            return;
          }
          if (Array.isArray(obj)) {
            for (const item of obj) findSchemaOrgObjects(item);
          } else {
            for (const key in obj) findSchemaOrgObjects(obj[key]);
          }
        };
        findSchemaOrgObjects(parsed);
      }
    } catch {}
  }
  $("script:not([src])").each((_, element) => {
    try {
      // 1. Check for dangerouslySetInnerHTML attribute (React pattern)
      const dsih = $(element).attr("dangerouslysetinnerhtml");
      if (dsih) {
        try {
          const parsed = JSON.parse(dsih);
          if (
            parsed &&
            parsed["@context"] &&
            String(parsed["@context"]).toLowerCase().includes("schema.org") &&
            parsed["@type"]
          ) {
            results.push(parsed);
          }
        } catch {}
      }
      // 2. Fallback: check for JSON-LD in script content
      const content = $(element).html();
      if (!content || content.trim() === "") return;
      const jsonRegex =
        /{[\s\S]*?"@context"[\s\S]*?:[\s\S]*?"https?:\/\/schema\.org"[\s\S]*?}/gi;
      const matches = content.match(jsonRegex);
      if (matches) {
        for (const match of matches) {
          try {
            const parsed = JSON.parse(match);
            if (parsed && parsed["@context"] && parsed["@type"]) {
              results.push(parsed);
            }
          } catch {}
        }
      }
    } catch {}
  });
  return results;
}

/**
 * Deduplicate schema objects
 * @param {Array} schemaData
 * @returns {Array}
 */
function deduplicateSchemaData(schemaData) {
  const uniqueSchemaData = [];
  const seen = new Set();
  for (const item of schemaData) {
    if (
      !item ||
      !item["@context"] ||
      !(
        String(item["@context"]).toLowerCase().includes("schema.org") ||
        String(item["@context"]).toLowerCase().includes("ogp.me/ns#")
      )
    )
      continue;
    const itemStr = JSON.stringify(item, Object.keys(item).sort());
    if (!seen.has(itemStr)) {
      seen.add(itemStr);
      uniqueSchemaData.push(item);
    }
  }
  return uniqueSchemaData;
}

/**
 * Extract Schema.org data from HTML using Selenium (dynamic crawling) or Axios (static fallback).
 * Returns an object with schemas array and bytesDownloaded.
 * @param {string} url - The target URL.
 * @returns {Promise<{result: object[], bytesDownloaded: number, details: string}>}
 */
export async function runTraditionalCrawler(url) {
  let html;
  let details = "";
  let usedSelenium = false;
  let bytesDownloaded = 0;
  // Handle local file URLs
  if (url.startsWith("file://")) {
    const filePath = url.replace("file://", "");
    html = fs.readFileSync(filePath, "utf-8");
    details = "Loaded from local file.";
    bytesDownloaded = Buffer.byteLength(html, 'utf-8');
  } else {
    // Try Selenium first
    try {
      html = await fetchHtmlWithSelenium(url);
      details = "Used Selenium for dynamic crawling.";
      usedSelenium = true;
      bytesDownloaded = Buffer.byteLength(html, 'utf-8');
    } catch {
      // Fallback to Axios
      try {
        html = await fetchHtmlWithAxios(url);
        details = "Used Axios for static crawling.";
        bytesDownloaded = Buffer.byteLength(html, 'utf-8');
      } catch {
        return {
          result: [],
          bytesDownloaded: 0,
          details: "Failed to fetch page.",
        };
      }
    }
  }
  const $ = cheerio.load(html);
  // Extract schemas using all methods
  let schemas = [
    ...extractJsonLd($),
    ...extractMicrodata($),
    ...extractRdfa($),
    ...extractReactNext($),
  ];
  schemas = deduplicateSchemaData(schemas);
  // Extract raw JSON-LD blocks for output
  const rawJsonLd = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      rawJsonLd.push(raw);
    } catch {}
  });
  // Always output schemas as an array
  let cleanedSchemas = schemas.map((s) => {
    const copy = { ...s };
    if ("checksum" in copy) delete copy.checksum;
    return copy;
  });
  const schemasOut = cleanedSchemas; // Always an array
  const checksumObj = { checksum: calculateModuleChecksum(schemasOut) };
  return { result: [...schemasOut, checksumObj], bytesDownloaded, details };
}

export { extractMicrodata, extractRdfa, extractReactNext, extractJsonLd };
