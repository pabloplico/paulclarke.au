import { toast } from '@repo/ui/sonner';

/** Client side: shows a failed request's `error` message, or the fallback. */
export async function toastRequestError(res: Response, fallback: string): Promise<void> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  toast.error(data?.error ?? fallback);
}
