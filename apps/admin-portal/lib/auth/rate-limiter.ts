import { createRateLimiter } from '@/lib/rate-limit';

/** Per-IP limiter: 10 requests per 15 minutes (login + signup). */
export const ipLimiter = createRateLimiter('auth-ip', 10, 15 * 60 * 1000);

/** Per-email limiter: 5 failed attempts per 15 minutes (login only). */
export const emailLimiter = createRateLimiter('auth-email', 5, 15 * 60 * 1000);

/**
 * Extract the client IP from request headers.
 * Cloud Run and reverse proxies set x-forwarded-for.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be "client, proxy1, proxy2" — take the leftmost
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return 'unknown';
}
