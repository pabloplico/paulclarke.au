/**
 * Runs the stub OpenAI server for the admin E2E suite (playwright.config.ts
 * starts it): `tsx test/fake-openai/main.ts`, on 127.0.0.1:FAKE_OPENAI_PORT
 * (default 4010).
 */
import { FAKE_OPENAI_PORT } from './constants';
import { createFakeOpenAI } from './server';

// Long enough for the chat panel's loading state to show before the answer
const { server } = createFakeOpenAI({ streamDelayMs: 500, log: true });

server.listen(FAKE_OPENAI_PORT, '127.0.0.1', () => {
  console.log(`[fake-openai] listening on http://127.0.0.1:${FAKE_OPENAI_PORT}`);
});
