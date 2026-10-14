import { aiConfigProblems } from '@/lib/ai/config-check';
import { dailyBudgets, maxOutputTokens } from '@/lib/ai/guard';
import { assertAccessConfig, devAccessIdentity } from '@/lib/auth/access';
import { isDemoMode } from '@/lib/demo';

/**
 * Configuration that must be right before the server takes a request.
 * instrumentation.ts runs these first and stops the process on failure,
 * because a demo that boots half-configured is worse than one that doesn't.
 */
export function runStartupChecks(): void {
  // Throws in production; harmless (returns the email or null) otherwise
  devAccessIdentity();

  if (isDemoMode()) {
    if (process.env.AUTH_ENABLED === 'false') {
      throw new Error(
        'DEMO_MODE=true with AUTH_ENABLED=false: the app would treat every visitor as its first user. Unset AUTH_ENABLED.'
      );
    }
    assertAccessConfig();
  }

  // Throws on malformed values (e.g. AI_DAILY_BUDGET_USD=abc)
  dailyBudgets();
  maxOutputTokens();

  // Provider, model and key must line up. In demo mode or production that's
  // fatal; in development it's a warning, so a half-set-up laptop still boots
  const problems = aiConfigProblems();
  if (problems.length) {
    const message = `AI configuration: ${problems.join(' ')}`;
    if (isDemoMode() || process.env.NODE_ENV === 'production') throw new Error(message);
    console.warn(`[startup] ${message}`);
  }
}
