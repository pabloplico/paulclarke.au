import { lookup } from 'node:dns/promises';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** HTTP status codes that suggest bot blocking — worth retrying with a real browser. */
const BOT_BLOCKED_STATUSES = new Set([403, 406, 429]);

/**
 * Check whether an IP address is in a private/reserved range.
 */
export function isPrivateIp(ip: string): boolean {
  // IPv6 checks
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7
    if (lower.startsWith('fe80')) return true; // fe80::/10
    return false;
  }

  // IPv4 checks
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const a = parts[0]!;
  const b = parts[1]!;
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / metadata)
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

const BLOCKED_HOSTNAMES = new Set(['metadata.google.internal', 'metadata.google.com']);

/**
 * Validate a URL is safe to fetch (not targeting internal services).
 * Rejects non-HTTP schemes, private IPs, and known metadata endpoints.
 */
export async function validateUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`URL scheme not allowed: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new Error(`Hostname blocked: ${hostname}`);
  }

  // Check if hostname is already an IP literal
  if (isPrivateIp(hostname)) {
    throw new Error(`URL targets a private/reserved IP: ${hostname}`);
  }

  // Resolve DNS and check all resolved addresses
  try {
    const addresses = await lookup(hostname, { all: true });
    const resolved = Array.isArray(addresses) ? addresses : [addresses];
    for (const entry of resolved) {
      if (isPrivateIp(entry.address)) {
        throw new Error(`URL resolves to a private/reserved IP: ${entry.address}`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('private')) {
      throw err;
    }
    // DNS resolution failure — let the fetch handle it
  }
}

/**
 * Fetch and extract text content from a URL.
 * Tries a lightweight HTTP fetch first. If the site blocks it (403, etc.),
 * retries with a headless Playwright browser as a fallback.
 */
export async function fetchUrlContent(url: string): Promise<{ text: string; title?: string }> {
  await validateUrl(url);

  // ── Attempt 1: lightweight fetch ────────────────────────────────────────
  const response = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html, application/xhtml+xml, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    // If it looks like bot-blocking, try the browser fallback before giving up
    if (BOT_BLOCKED_STATUSES.has(response.status)) {
      const browserResult = await fetchWithBrowser(url);
      if (browserResult) return browserResult;
    }

    const host = new URL(url).hostname;
    throw new Error(
      `Could not access ${host} — the site returned ${response.status}. ` +
        'It may be blocking automated access or require authentication.'
    );
  }

  return parseResponse(response);
}

/**
 * Fallback: render the page in a headless browser to bypass JS-based protection.
 * Returns null if Playwright is not available rather than throwing.
 */
async function fetchWithBrowser(url: string): Promise<{ text: string; title?: string } | null> {
  try {
    // Dynamic import — playwright may not be installed in every environment
    const { chromium } = await import('playwright');
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
    const browser = await chromium.launch({ headless: true, executablePath });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      // Let JS-rendered content settle
      await page.waitForTimeout(2_000);

      const title = await page.title();
      const text = await page.evaluate(() => document.body.innerText);

      if (!text?.trim()) return null;

      return { text: text.trim(), title: title || undefined };
    } finally {
      await browser.close();
    }
  } catch {
    // Playwright not installed or browser launch failed — degrade gracefully
    return null;
  }
}

async function parseResponse(response: Response): Promise<{ text: string; title?: string }> {
  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();

  // Plain text — return as-is
  if (contentType.includes('text/plain')) {
    return { text: body };
  }

  // HTML — strip tags and extract title
  const title = extractTitle(body);
  const text = stripHtml(body);

  if (!text.trim()) {
    throw new Error(
      'The page was fetched but no readable text could be extracted. ' +
        'It may be a single-page app that requires JavaScript to render.'
    );
  }

  return { text, title };
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeEntities(match[1].trim()) : undefined;
}

function stripHtml(html: string): string {
  let text = html;

  // Remove script and style blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');

  // Convert block elements to newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section|article)[^>]*>/gi, '\n');

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = decodeEntities(text);

  // Normalize whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

  return text.trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)));
}
