type ParsedError = {
  code: string;
  message: string;
  permanent: boolean;
  stage?: string;
};

/**
 * Turn a raw `processingError` JSON string (stored in the DB) into a
 * short, human-friendly message suitable for display in the UI.
 */
export function formatProcessingError(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let parsed: ParsedError;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON — return as-is (legacy plain-text errors)
    return raw;
  }

  const msg = parsed.message ?? '';

  // URL fetch failures
  if (msg.includes('Could not access') || msg.includes('Failed to fetch URL')) {
    // Already has a friendly message from the updated fetcher
    if (msg.includes('Could not access')) return msg;

    // Legacy format: "Failed to fetch URL: 403 Forbidden"
    const status = msg.match(/(\d{3})/)?.[1];
    if (status === '403' || status === '406')
      return 'This website blocked automated access. Try saving the page content manually instead.';
    if (status === '404')
      return 'The URL returned a 404 — the page may have been moved or deleted.';
    if (status === '429') return 'The website is rate-limiting requests. Try again later.';
    if (status === '401')
      return 'The URL requires authentication and cannot be accessed automatically.';
    return `The website could not be reached (HTTP ${status}).`;
  }

  if (msg.includes('No text content') || msg.includes('no readable text'))
    return 'The page was fetched but no readable text could be extracted. It may require JavaScript to render.';

  if (msg.includes('Invalid URL'))
    return 'The provided URL is not valid. Check the address and try again.';

  if (msg.includes('timed out') || msg.includes('AbortError'))
    return 'The request timed out — the website took too long to respond.';

  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo'))
    return 'Could not find the website. Check the URL for typos.';

  // File parsing failures
  if (msg.includes('Unsupported file type'))
    return `This file type is not supported. Supported formats: PDF, DOCX, CSV, and Markdown.`;

  if (msg.includes('corrupt') || msg.includes('parse'))
    return 'The file could not be read — it may be corrupted or in an unsupported format.';

  // Fallback — return original message if it's short enough, otherwise truncate
  if (msg.length > 120) return `${msg.slice(0, 117)}...`;
  return msg || 'An unexpected error occurred during processing.';
}
