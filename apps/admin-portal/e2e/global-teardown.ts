import { FAKE_OPENAI_URL } from '../test/fake-openai/constants';
import type { UnmatchedRequest } from '../test/fake-openai/server';

/**
 * Fails the run if the stub OpenAI server answered any request with a 500
 * because it had no reply for it. Gap analysis, research search and the
 * fidelity check carry on without AI, so a test could pass anyway.
 */
export default async function globalTeardown() {
  const unmatched: UnmatchedRequest[] = await (
    await fetch(`${FAKE_OPENAI_URL}/__unmatched`)
  ).json();
  if (unmatched.length > 0) {
    throw new Error(
      `The stub OpenAI server had no reply for ${unmatched.length} request(s). ` +
        'Either the app sent something new (add a reply in test/fake-openai/server.ts) ' +
        `or it's broken:\n${unmatched.map((u) => `- ${u.path}: ${u.reason}\n  ${u.prompt}`).join('\n')}`
    );
  }
}
