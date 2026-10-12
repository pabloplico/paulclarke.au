/**
 * Deterministic stand-ins for the chat and embedding models, for tests only.
 *
 * They're injected with vi.mock('@/lib/ai/models') in the test file that
 * needs them. Nothing in the app can select them: lib/ai has no "fake"
 * provider, so a misconfigured deployment can't end up on fake AI.
 */
import { MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test';

/** The parts of a JSON schema that minimalValue() reads. */
interface JsonSchema {
  type?: string | string[];
  enum?: unknown[];
  anyOf?: (JsonSchema | boolean)[];
  properties?: Record<string, JsonSchema | boolean>;
  items?: JsonSchema | boolean | (JsonSchema | boolean)[];
  minItems?: number;
  minimum?: number;
}

export const FAKE_EMBEDDING_DIMENSIONS = 1536;

/**
 * Bag-of-words embedding: each word is hashed (FNV-1a) into one of 1536
 * buckets, then the vector is normalised. Texts that share words score as
 * similar under cosine distance, so vector search returns sensible matches
 * without an API call.
 */
export function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(FAKE_EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < word.length; i++) {
      hash ^= word.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    vector[hash % FAKE_EMBEDDING_DIMENSIONS] = (vector[hash % FAKE_EMBEDDING_DIMENSIONS] ?? 0) + 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((v) => v / norm);
}

/** The smallest value that satisfies a JSON schema (the shape generateObject asks for). */
export function minimalValue(schema: JsonSchema): unknown {
  if (schema.enum?.length) return schema.enum[0];
  if (schema.anyOf?.[0] && typeof schema.anyOf[0] === 'object')
    return minimalValue(schema.anyOf[0]);
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case 'object': {
      const result: Record<string, unknown> = {};
      for (const [key, property] of Object.entries(schema.properties ?? {})) {
        if (typeof property === 'object') result[key] = minimalValue(property);
      }
      return result;
    }
    case 'array': {
      const items = typeof schema.items === 'object' && !Array.isArray(schema.items);
      return Array.from({ length: schema.minItems ?? 0 }, () =>
        items ? minimalValue(schema.items as JsonSchema) : null
      );
    }
    case 'number':
    case 'integer':
      return schema.minimum ?? 0.5;
    case 'boolean':
      return false;
    case 'null':
      return null;
    default:
      return 'fake';
  }
}

/**
 * A chat model that answers every generateObject call with a minimal valid
 * object. `overrides` replaces top-level fields wherever the requested schema
 * has them, e.g. { suggestions: () => [...] } for workspace routing, whose
 * ids the test knows and the model can't invent.
 */
export function createFakeChatModel(overrides: Record<string, () => unknown> = {}) {
  return new MockLanguageModelV3({
    provider: 'fake',
    modelId: 'fake-chat',
    doGenerate: async (options) => {
      const format = options.responseFormat;
      let text = 'fake response';
      if (format?.type === 'json' && format.schema) {
        const value = minimalValue(format.schema as JsonSchema);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          for (const [key, make] of Object.entries(overrides)) {
            if (key in value) (value as Record<string, unknown>)[key] = make();
          }
        }
        text = JSON.stringify(value);
      }
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}

export function createFakeEmbeddingModel() {
  return new MockEmbeddingModelV3({
    provider: 'fake',
    modelId: 'fake-embedding',
    maxEmbeddingsPerCall: 100,
    doEmbed: async ({ values }) => ({
      embeddings: values.map((value) => fakeEmbedding(String(value))),
      usage: { tokens: values.length },
      warnings: [],
    }),
  });
}
