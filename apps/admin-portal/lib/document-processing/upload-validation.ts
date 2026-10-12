import { config } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { supportedMimeTypes } from './parsers';

/**
 * Demo uploads: small, plain-text formats only.
 * - 2 MB, so a visitor can't fill the instance's in-memory disk or RAM.
 * - No PDF: pdf-parse 1.1.1 bundles a 2017 pdf.js, far older than the fix
 *   for CVE-2024-4367 (code execution from a crafted font), and running an
 *   unpatched parser on strangers' files is the risk not worth taking.
 * - No DOCX: it's a zip, and the parser decompresses without a size limit.
 */
export const DEMO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const DEMO_UPLOAD_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.csv']);
const DEMO_UPLOAD_MIME_TYPES = new Set([
  '',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
]);
/** Room for multipart boundaries and headers around the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * Demo mode: refuse a request body that's too big *before* reading it, so
 * an oversized upload is never buffered into memory. A body with no
 * Content-Length (chunked) is refused too, since its size is unknown.
 * Returns the response to send, or null to carry on.
 */
export function rejectOversizedDemoRequest(request: Request): Response | null {
  if (!isDemoMode()) return null;
  const length = Number(request.headers.get('content-length'));
  if (!request.headers.get('content-length') || !Number.isFinite(length)) {
    return Response.json({ error: 'Content-Length is required' }, { status: 411 });
  }
  if (length > DEMO_UPLOAD_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return Response.json({ error: 'Uploads in the demo are limited to 2 MB.' }, { status: 413 });
  }
  return null;
}

const supportedExtensions = new Set(['.txt', '.md', '.markdown', '.pdf', '.docx', '.csv']);

type ValidationResult = { valid: true } | { valid: false; error: string; status: number };

/**
 * Validate a file upload before storage or database writes.
 * Checks size and MIME type against allowlists.
 */
export function validateFileUpload(file: File): ValidationResult {
  if (isDemoMode()) return validateDemoUpload(file);

  // Check size limit
  const maxSize = config.upload?.maxFileSizeBytes ?? 25 * 1024 * 1024;
  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    return {
      valid: false,
      error: `File too large (${Math.round(file.size / (1024 * 1024))}MB). Maximum size is ${maxMB}MB.`,
      status: 413,
    };
  }

  // Check MIME type or extension
  const mimeAllowed = supportedMimeTypes.includes(file.type);
  let extAllowed = false;

  if (file.name) {
    const dotIdx = file.name.lastIndexOf('.');
    if (dotIdx >= 0) {
      const ext = file.name.slice(dotIdx).toLowerCase();
      extAllowed = supportedExtensions.has(ext);
    }
  }

  if (!mimeAllowed && !extAllowed) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type || 'unknown'}. Supported: PDF, DOCX, CSV, Markdown, plain text.`,
      status: 400,
    };
  }

  return { valid: true };
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/** Demo rules: the extension must be allowed *and* the type, if sent, must be text. */
function validateDemoUpload(file: File): ValidationResult {
  if (file.size > DEMO_UPLOAD_MAX_BYTES) {
    return { valid: false, error: 'Uploads in the demo are limited to 2 MB.', status: 413 };
  }
  if (
    !DEMO_UPLOAD_EXTENSIONS.has(extensionOf(file.name ?? '')) ||
    !DEMO_UPLOAD_MIME_TYPES.has(file.type)
  ) {
    return {
      valid: false,
      error: 'The demo accepts Markdown, plain text and CSV files.',
      status: 400,
    };
  }
  return { valid: true };
}
