import { NextResponse } from 'next/server';
import { z } from 'zod';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAdminApi, requireAuthApi } from '@/lib/auth/server';
import { SETTING_KEYS } from '@/lib/config';
import { loadConfig } from '@/lib/config.server';
import { updateSettings } from '@/lib/settings';

export async function GET() {
  await requireAuthApi();
  const cfg = await loadConfig();
  return NextResponse.json(cfg);
}

const patchSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .refine((obj) => Object.keys(obj).every((k) => (SETTING_KEYS as readonly string[]).includes(k)), {
    message: 'Unknown setting key',
  });

export async function PATCH(request: Request) {
  // Settings are global (shared by every user), so only an admin may change
  // them. In demo mode the middleware refuses the request before it gets here
  await requireAdminApi();
  const jsonResult = await safeParseJson(request);
  if (jsonResult.error) return jsonResult.error;
  const body = jsonResult.data as Record<string, string | number | boolean>;

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid settings', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await updateSettings(parsed.data);

  const updated = await loadConfig();
  return NextResponse.json(updated);
}
