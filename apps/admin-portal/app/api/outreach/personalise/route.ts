import { generateText } from 'ai';
import { inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAiAllowance } from '@/lib/ai/allowance';
import { getModel } from '@/lib/ai/models';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import { adminClients } from '@/lib/db/schema';

const CONCURRENCY = 3;
const MAX_NOTES_LENGTH = 500;

const SYSTEM_PROMPT = `You are an email personalisation assistant. You will receive an email template and details about a specific recipient. Your job is to adapt the template so it feels naturally written for that person.

Rules:
- Use the recipient's name, company, industry, and any notes provided to make the email feel specific
- Preserve the sender's voice, tone, and intent from the original template
- Keep approximately the same length as the original template
- Do NOT invent facts, claims, or specifics not provided in the recipient details
- Do NOT add a subject line, greeting prefix like "Subject:", or any metadata
- Do NOT use markdown formatting
- Return ONLY the email body text`;

type PersonaliseRequest = {
  template: string;
  clientIds: number[];
  tone?: string;
};

type PersonaliseResult = {
  clientId: number;
  contactName: string;
  companyName: string;
  email: string;
  personalisedBody: string;
  error?: string;
};

export async function POST(request: Request) {
  const user = await requireAuthApi();
  await requireAiAllowance(user);

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;

  const { template, clientIds, tone } = parsed.data as PersonaliseRequest;

  if (!template?.trim()) {
    return NextResponse.json({ error: 'Template is required' }, { status: 400 });
  }
  if (!clientIds?.length) {
    return NextResponse.json({ error: 'At least one client must be selected' }, { status: 400 });
  }

  const clients = await db.select().from(adminClients).where(inArray(adminClients.id, clientIds));

  // Verify all clients belong to this user
  const userClients = clients.filter((c) => c.userId === user.id);
  if (userClients.length === 0) {
    return NextResponse.json({ error: 'No valid clients found' }, { status: 404 });
  }

  const cfg = await loadConfig();
  const model = getModel(cfg);

  const toneInstruction = tone ? `\nUse a ${tone.toLowerCase()} tone throughout.` : '';

  // Process with concurrency cap
  const results: PersonaliseResult[] = [];
  for (let i = 0; i < userClients.length; i += CONCURRENCY) {
    const batch = userClients.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (client): Promise<PersonaliseResult> => {
        const notes = client.notes ? client.notes.slice(0, MAX_NOTES_LENGTH) : '';

        const clientContext = [
          `Name: ${client.contactName}`,
          client.companyName && `Company: ${client.companyName}`,
          client.industry && `Industry: ${client.industry}`,
          notes && `Notes: ${notes}`,
        ]
          .filter(Boolean)
          .join('\n');

        try {
          const result = await generateText({
            model,
            system: SYSTEM_PROMPT + toneInstruction,
            messages: [
              {
                role: 'user',
                content: `Recipient details:\n${clientContext}\n\nEmail template to personalise:\n${template}`,
              },
            ],
          });

          return {
            clientId: client.id,
            contactName: client.contactName,
            companyName: client.companyName || '',
            email: client.email || '',
            personalisedBody: result.text,
          };
        } catch (err) {
          return {
            clientId: client.id,
            contactName: client.contactName,
            companyName: client.companyName || '',
            email: client.email || '',
            personalisedBody: '',
            error: err instanceof Error ? err.message : 'Failed to personalise',
          };
        }
      })
    );
    results.push(...batchResults);
  }

  return NextResponse.json({ results });
}
