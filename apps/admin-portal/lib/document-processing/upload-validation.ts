import { config } from '@/lib/config';
import { supportedMimeTypes } from './parsers';

const supportedExtensions = new Set(['.txt', '.md', '.markdown', '.pdf', '.docx', '.csv']);

type ValidationResult = { valid: true } | { valid: false; error: string; status: number };

/**
 * Validate a file upload before storage or database writes.
 * Checks size and MIME type against allowlists.
 */
export function validateFileUpload(file: File): ValidationResult {
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
