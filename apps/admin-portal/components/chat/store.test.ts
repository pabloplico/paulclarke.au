import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from './store';

/**
 * The chat store's background resume: changing scope reloads that scope's
 * last conversation. It must never replace a conversation the user has
 * started meanwhile, nor stop them sending.
 */

const LAST_CONVERSATION = {
  conversation: { id: 7, scope: { type: 'workspace', workspaceId: 3 } },
  messages: [
    { role: 'user', content: 'An old question' },
    { role: 'assistant', content: 'An old answer' },
  ],
};

/** A promise and the function that resolves it. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** Stubs fetch: the "last conversation" lookup (and, if asked, its messages) wait until released. */
function stubFetch({ holdMessages = false } = {}) {
  const lastLookup = deferred<Response>();
  const messages = deferred<Response>();
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.startsWith('/api/chat/conversations?')) return lastLookup.promise;
      if (url === '/api/chat/conversations/7/messages') {
        return holdMessages ? messages.promise : json(LAST_CONVERSATION);
      }
      if (url === '/api/chat/unified') {
        return new Response('A new answer', { headers: { 'X-Conversation-Id': '42' } });
      }
      throw new Error(`unexpected fetch ${url}`);
    })
  );
  return {
    calls,
    releaseLastLookup: () => lastLookup.resolve(json([{ id: 7 }])),
    releaseMessages: () => messages.resolve(json(LAST_CONVERSATION)),
  };
}

/** Lets pending promise callbacks run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  useChatStore.setState(useChatStore.getInitialState(), true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chat store: resuming the last conversation', () => {
  it('resumes the scope’s last conversation when nothing else happens', async () => {
    const { releaseLastLookup } = stubFetch();

    useChatStore.getState().setScope({ type: 'workspace', workspaceId: 3 });
    releaseLastLookup();
    await settle();

    expect(useChatStore.getState()).toMatchObject({
      conversationId: 7,
      messages: LAST_CONVERSATION.messages,
    });
  });

  it('keeps a message sent before the resume finishes', async () => {
    const { calls, releaseLastLookup } = stubFetch();

    useChatStore.getState().setScope({ type: 'workspace', workspaceId: 3 });
    await useChatStore.getState().send('A new question');
    releaseLastLookup();
    await settle();

    expect(useChatStore.getState()).toMatchObject({
      conversationId: 42,
      messages: [
        { role: 'user', content: 'A new question' },
        { role: 'assistant', content: 'A new answer' },
      ],
    });
    // The old conversation wasn't even fetched
    expect(calls).not.toContain('/api/chat/conversations/7/messages');
  });

  it('doesn’t block sending while it loads the conversation', async () => {
    const { calls, releaseLastLookup, releaseMessages } = stubFetch({ holdMessages: true });

    useChatStore.getState().setScope({ type: 'workspace', workspaceId: 3 });
    releaseLastLookup();
    await settle();

    // Fetching the old conversation's messages: input stays enabled
    expect(calls).toContain('/api/chat/conversations/7/messages');
    expect(useChatStore.getState().loading).toBe(false);
    releaseMessages();
    await settle();
    expect(useChatStore.getState().conversationId).toBe(7);
  });

  it('drops its result after "New chat"', async () => {
    const { releaseLastLookup } = stubFetch();

    useChatStore.getState().setScope({ type: 'workspace', workspaceId: 3 });
    useChatStore.getState().newChat();
    releaseLastLookup();
    await settle();

    expect(useChatStore.getState()).toMatchObject({ conversationId: null, messages: [] });
  });
});
