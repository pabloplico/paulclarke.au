import { toast } from '@repo/ui/sonner';

/**
 * Client side: when an AI request was refused with a 429 (the per-user rate
 * limit, a daily spend cap or the provider's spending limit), show the
 * server's reason, so the button doesn't just appear to do nothing.
 * Returns true when it showed one.
 */
export async function toastAiRefusal(res: Response): Promise<boolean> {
  if (res.status !== 429) return false;
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  toast.error(data?.error ?? 'AI is unavailable right now. Please try again later.');
  return true;
}
