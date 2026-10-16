/**
 * A stub of the two OpenAI endpoints the admin portal calls, for E2E runs:
 * POST /v1/responses (what `openai(model)` uses in @ai-sdk/openai 3.x, plain
 * and streamed) and POST /v1/embeddings. The app talks to it through the real
 * provider and the AI guard, with OPENAI_BASE_URL pointing here.
 *
 * Dumb and strict. Each request the app makes is recognised by a phrase from
 * its prompt and gets a canned reply (REPLIES below). Anything else gets a
 * 500 and is recorded; GET /__unmatched lists those, and the E2E teardown
 * fails the run if there are any, because some call sites swallow AI errors.
 *
 * Embeddings are the bag-of-words vectors from test/fake-ai.ts.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fakeEmbedding } from '../fake-ai';
import { SLOW_MARKER, STUB_CHAT_ANSWER, STUB_GAP_ISSUE, STUB_TEMPLATE_CONTENT } from './constants';

/** How long a request containing SLOW_MARKER waits before its reply */
const SLOW_MS = 10_000;

/** One request the stub had no reply for. */
export interface UnmatchedRequest {
  path: string;
  reason: string;
  /** The start of the request's prompt, enough to see which call site it was */
  prompt: string;
}

/** A canned reply: plain text, or an object for a structured-output request. */
type Reply = { text: string } | { object: unknown };

interface ReplyRule {
  /** For the log and the test: which call site this is */
  name: string;
  /** A phrase only that call site's prompt contains */
  marker: string;
  reply: (prompt: string) => Reply;
}

const CANNED_CLAIM = {
  claims: [{ text: 'Fake claim from the stub.', type: 'fact', confidence: 0.9 }],
  entities: [{ name: 'Stub Pty Ltd', type: 'organization' }],
  topicKeywords: ['stub', 'e2e', 'fake'],
};

/** The first markdown heading in the text, for a document's suggested title. */
function firstHeading(text: string): string {
  return text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? 'Fake document';
}

/** The text between the first ``` fence pair after `label`. */
function fencedAfter(prompt: string, label: string): string | undefined {
  const start = prompt.indexOf(label);
  if (start === -1) return undefined;
  return prompt.slice(start).match(/```[a-z]*\n([\s\S]*?)\n```/)?.[1];
}

const REPLIES: ReplyRule[] = [
  // ── Document processing (lib/document-processing) ─────────────────────────
  {
    name: 'chunk analysis (one chunk)',
    marker: 'Analyze this text chunk (chunk',
    reply: () => ({ object: CANNED_CLAIM }),
  },
  {
    name: 'chunk analysis (batch)',
    marker: 'Analyze each text chunk below.',
    reply: (prompt) => ({
      object: {
        chunks: [...prompt.matchAll(/--- CHUNK (\d+) ---/g)].map((m) => ({
          chunkIndex: Number(m[1]),
          analysis: CANNED_CLAIM,
        })),
      },
    }),
  },
  {
    name: 'enriched metadata',
    marker: 'You are synthesizing metadata for a document',
    reply: (prompt) => ({
      object: {
        summary: 'A fake summary from the stub [chunk 0].',
        suggestedTitle: firstHeading(prompt.split('DOCUMENT PREVIEW:')[1] ?? ''),
        tags: ['stub', 'e2e', 'fake'],
        language: 'en',
        documentType: 'other',
        entities: [{ name: 'Stub Pty Ltd', type: 'organization', chunkRefs: [0] }],
        keyDecisions: [],
        actionItems: [],
        fieldConfidence: { summary: 0.9, title: 0.9, tags: 0.9, documentType: 0.9 },
      },
    }),
  },
  {
    name: 'basic metadata',
    marker: 'Analyze the following document text and extract metadata.',
    reply: (prompt) => ({
      object: {
        summary: 'A fake summary from the stub.',
        suggestedTitle: firstHeading(prompt),
        tags: ['stub', 'e2e', 'fake'],
        language: 'en',
        documentType: 'other',
      },
    }),
  },

  // ── Workspace routing (lib/workspace-routing/router.ts) ───────────────────
  {
    // The first section of the first workspace in the map. The map lists
    // `Workspace [id=W] "…"` lines, each followed by `- [id=S] "…"` section lines
    name: 'workspace routing',
    marker: 'You are a knowledge management routing system.',
    reply: (prompt) => {
      const map = prompt.split('## Incoming Material')[0] ?? '';
      const workspace = map.match(/Workspace \[id=(\d+)\]([\s\S]*?)(?=\n\s*Workspace \[id=|$)/);
      const section = workspace?.[2]?.match(/- \[id=(\d+)\]/);
      const title = prompt.match(/## Incoming Material\s*\nTitle: (.+)/)?.[1]?.trim() ?? '';
      return {
        object: {
          suggestions:
            workspace && section
              ? [
                  {
                    workspaceId: Number(workspace[1]),
                    sectionId: Number(section[1]),
                    confidence: 0.9,
                    action: 'append',
                    suggestedContent: `Routed: ${title}`,
                    reasoning: 'The stub routes everything to the first section.',
                    chunkRefs: [0],
                  },
                ]
              : [],
        },
      };
    },
  },

  // ── Gap analysis (app/api/workspaces/[id]/gap-analysis) ───────────────────
  {
    // One finding per empty section, so a workspace with none stays healthy
    name: 'gap analysis',
    marker: 'You are a knowledge base quality analyst.',
    reply: (prompt) => ({
      object: {
        findings: [...prompt.matchAll(/^### (.+) \([^\n]*\)\n\(empty\)$/gm)].map((m) => ({
          sectionTitle: m[1],
          severity: 'high',
          issue: STUB_GAP_ISSUE,
          suggestion: 'Add some content.',
        })),
      },
    }),
  },

  // ── AI editing (app/api/workspaces/[id]/sections/[sectionId]/ai-edit) ─────
  {
    name: 'analyse topics',
    marker: 'Extract key topics from the following text:',
    reply: () => ({ object: { topics: ['Fake topic one', 'Fake topic two', 'Fake topic three'] } }),
  },
  {
    // An empty section (Fix with AI on an empty section): content in its template's shape
    name: 'generate an empty section',
    marker: 'Your task is to generate initial content for an empty section.',
    reply: (prompt) => {
      const template = prompt.match(/Section template type: ([\w-]+)/)?.[1] ?? 'prose';
      return { text: STUB_TEMPLATE_CONTENT[template] ?? STUB_TEMPLATE_CONTENT.prose ?? '' };
    },
  },
  {
    // Rewrite, expand, simplify, custom and Fix with AI on a whole section
    name: 'edit a whole section',
    marker: 'Apply the action to the entire section.',
    reply: (prompt) => ({ text: `Revised: ${fencedAfter(prompt, '## Section Content') ?? ''}` }),
  },
  {
    // The same actions on selected text: the whole section back, the selection revised
    name: 'edit selected text',
    marker: 'Return the complete updated section content with the selected text modified',
    reply: (prompt) => {
      const full = fencedAfter(prompt, '## Full Section Content') ?? '';
      const selected = fencedAfter(prompt, '## Selected Text to Modify') ?? '';
      return { text: full.replace(selected, `Revised: ${selected}`) };
    },
  },

  // ── Chat (app/api/chat/unified) ───────────────────────────────────────────
  {
    name: 'chat',
    marker: 'You are a knowledgeable assistant for the',
    reply: () => ({ text: STUB_CHAT_ANSWER }),
  },
  {
    name: 'chat (no scope)',
    marker: "You are a helpful assistant. Answer the user's question clearly and concisely.",
    reply: () => ({ text: STUB_CHAT_ANSWER }),
  },
];

/** All the text in a Responses API `input`: system, user and assistant messages. */
function promptText(input: unknown): string {
  if (typeof input === 'string') return input;
  if (!Array.isArray(input)) return '';
  return input
    .map((item: { content?: unknown }) => {
      if (typeof item.content === 'string') return item.content;
      if (Array.isArray(item.content)) {
        return item.content
          .map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : ''))
          .join('\n');
      }
      return '';
    })
    .join('\n');
}

/** Rough token count: four characters a token, at least one. */
const tokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export interface FakeOpenAIOptions {
  /** Waits this long before streaming the first text, so a client's loading state is visible */
  streamDelayMs?: number;
  /** Logs each request's rule (or miss) to stdout */
  log?: boolean;
}

/** Creates the stub (not listening yet). `unmatched` collects the requests it had no reply for. */
export function createFakeOpenAI({ streamDelayMs = 0, log = false }: FakeOpenAIOptions = {}): {
  server: Server;
  unmatched: UnmatchedRequest[];
} {
  const unmatched: UnmatchedRequest[] = [];

  function reject(res: ServerResponse, path: string, reason: string, prompt = '') {
    const entry = { path, reason, prompt: prompt.slice(0, 300) };
    unmatched.push(entry);
    console.error('[fake-openai] no reply:', JSON.stringify(entry));
    sendJson(res, 500, {
      error: {
        message: `fake-openai has no reply for this request (${reason}). Add one to test/fake-openai/server.ts if the app is right.`,
        type: 'fake_openai_unmatched',
        code: 'unmatched',
      },
    });
  }

  async function responses(req: IncomingMessage, res: ServerResponse) {
    const body = await readJson(req);
    const prompt = promptText(body.input);
    const rule = REPLIES.find((r) => prompt.includes(r.marker));
    if (!rule) return reject(res, '/v1/responses', 'no rule matches the prompt', prompt);

    const reply = rule.reply(prompt);
    const wantsObject =
      (body.text as { format?: { type?: string } } | undefined)?.format?.type === 'json_schema';
    if (wantsObject !== 'object' in reply) {
      return reject(
        res,
        '/v1/responses',
        `rule "${rule.name}" gives ${'object' in reply ? 'an object' : 'text'}, the request wants ${wantsObject ? 'an object' : 'text'}`,
        prompt
      );
    }
    if (log) console.log(`[fake-openai] ${rule.name}`);

    const text = 'object' in reply ? JSON.stringify(reply.object) : reply.text;
    const model = String(body.model);
    const usage = { input_tokens: tokens(prompt), output_tokens: tokens(text) };
    const messageId = `msg_${randomUUID()}`;
    const responseId = `resp_${randomUUID()}`;
    const createdAt = Math.floor(Date.now() / 1000);

    if (!body.stream) {
      return sendJson(res, 200, {
        id: responseId,
        object: 'response',
        created_at: createdAt,
        model,
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            id: messageId,
            status: 'completed',
            content: [{ type: 'output_text', text, annotations: [] }],
          },
        ],
        usage,
      });
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    const event = (data: Record<string, unknown>) =>
      res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
    event({
      type: 'response.created',
      response: { id: responseId, created_at: createdAt, model },
    });
    event({
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'message', id: messageId },
    });
    if (streamDelayMs > 0) await new Promise((r) => setTimeout(r, streamDelayMs));
    // Word by word, so the client sees more than one delta
    for (const delta of text.match(/\S+\s*/g) ?? [text]) {
      event({ type: 'response.output_text.delta', item_id: messageId, delta });
    }
    event({
      type: 'response.output_item.done',
      output_index: 0,
      item: { type: 'message', id: messageId },
    });
    event({ type: 'response.completed', response: { usage } });
    res.end();
  }

  async function embeddings(req: IncomingMessage, res: ServerResponse) {
    const body = await readJson(req);
    const input = Array.isArray(body.input) ? body.input.map(String) : [String(body.input ?? '')];
    if (log) console.log(`[fake-openai] embeddings (${input.length})`);
    if (input.some((text) => text.includes(SLOW_MARKER))) {
      await new Promise((r) => setTimeout(r, SLOW_MS));
    }
    const promptTokens = input.reduce((n, text) => n + tokens(text), 0);
    sendJson(res, 200, {
      object: 'list',
      data: input.map((text, index) => ({
        object: 'embedding',
        index,
        embedding: fakeEmbedding(text),
      })),
      model: String(body.model),
      usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
    });
  }

  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    const handle = async () => {
      if (req.method === 'GET' && path === '/health') return sendJson(res, 200, { ok: true });
      if (req.method === 'GET' && path === '/__unmatched') return sendJson(res, 200, unmatched);
      if (req.method === 'POST' && path === '/v1/responses') return responses(req, res);
      if (req.method === 'POST' && path === '/v1/embeddings') return embeddings(req, res);
      return reject(res, path, `no endpoint for ${req.method} ${path}`);
    };
    handle().catch((error: unknown) => {
      reject(res, path, `stub error: ${error instanceof Error ? error.message : String(error)}`);
    });
  });

  return { server, unmatched };
}
