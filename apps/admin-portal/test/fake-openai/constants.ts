/**
 * What the E2E stub OpenAI server (./server.ts) and the specs that rely on its
 * replies share: where it listens, and the canned text a spec looks for.
 * No imports, so Playwright can load it without the AI SDK.
 */
export const FAKE_OPENAI_PORT = Number(process.env.FAKE_OPENAI_PORT ?? 4010);
export const FAKE_OPENAI_URL = `http://127.0.0.1:${FAKE_OPENAI_PORT}`;

/**
 * Text containing this makes its embedding request wait 10 s first, so an
 * E2E test can catch a document part-way through processing.
 */
export const SLOW_MARKER = '[stub:slow]';

/** The chat answer. */
export const STUB_CHAT_ANSWER = 'Fake answer from the stub.';

/** The issue of each gap-analysis finding (one per empty section). */
export const STUB_GAP_ISSUE = 'Fake finding: this section is empty.';

/** Content for an empty section, in the shape each template's parser reads (lib/workspaces/parse-structured.ts). */
export const STUB_TEMPLATE_CONTENT: Record<string, string> = {
  prose: 'Generated: fake prose for an empty section.',
  table: '| Name | Detail |\n| --- | --- |\n| Generated row | Fake detail |',
  cards: '## Generated card\n\nFake card body.',
  checklist: '- [ ] Generated item\n- [ ] Another generated item',
  'kv-pairs': '- **Generated key**: Fake value',
};
