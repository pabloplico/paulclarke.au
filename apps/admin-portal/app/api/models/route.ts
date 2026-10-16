import { NextResponse } from 'next/server';
import { FALLBACK_MODELS } from '@/lib/ai/fallback-models';
import { requireAuthApi } from '@/lib/auth/server';
import { config } from '@/lib/config';

type ProviderInfo = {
  available: boolean;
  models: { id: string; name: string }[];
};

type CacheEntry = {
  data: Record<string, ProviderInfo>;
  timestamp: number;
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let cache: CacheEntry | null = null;

async function fetchOpenAIModels(apiKey: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return FALLBACK_MODELS.openai!;

  const data = await res.json();
  const chatPrefixes = ['gpt-', 'o', 'chatgpt-'];

  // Filter out dated snapshots (e.g. gpt-4o-2024-08-06), distill/search variants,
  // realtime/audio/tts models, and non-chat models to keep the list short.
  const dateSnapshotRe = /-(20\d{2}[-_]?\d{2}[-_]?\d{2})/;
  const excludePatterns = ['realtime', 'audio', 'tts', 'distill', 'search', 'transcri', 'whisper'];

  return (data.data as { id: string; created?: number }[])
    .filter((m) => chatPrefixes.some((p) => m.id.startsWith(p)))
    .filter((m) => !excludePatterns.some((p) => m.id.includes(p)))
    .filter((m) => !dateSnapshotRe.test(m.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .map((m) => ({ id: m.id, name: m.id }));
}

async function fetchAnthropicModels(apiKey: string): Promise<{ id: string; name: string }[]> {
  const models: { id: string; name: string }[] = [];
  let hasMore = true;
  let afterId: string | undefined;

  while (hasMore) {
    const url = new URL('https://api.anthropic.com/v1/models');
    url.searchParams.set('limit', '100');
    if (afterId) url.searchParams.set('after_id', afterId);

    const res = await fetch(url.toString(), {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    if (!res.ok) return FALLBACK_MODELS.anthropic!;

    const data = await res.json();
    for (const m of data.data as { id: string; display_name?: string }[]) {
      models.push({ id: m.id, name: m.display_name ?? m.id });
    }
    hasMore = data.has_more === true;
    if (hasMore && data.data.length > 0) {
      afterId = data.data[data.data.length - 1].id;
    }
  }

  return models.sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchGeminiModels(apiKey: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) return FALLBACK_MODELS.gemini!;

  const data = await res.json();
  return (data.models as { name: string; displayName?: string }[])
    .filter((m) => m.name.includes('gemini'))
    .map((m) => {
      // API returns "models/gemini-2.5-flash", strip the prefix
      const id = m.name.replace('models/', '');
      return { id, name: m.displayName ?? id };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchOllamaModels(baseUrl: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];

  const data = await res.json();
  return (
    (data.models ?? []) as { name: string; size?: number; details?: { parameter_size?: string } }[]
  )
    .map((m) => {
      const size = m.details?.parameter_size ?? '';
      const label = size ? `${m.name} (${size})` : m.name;
      return { id: m.name, name: label };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchAllModels(): Promise<Record<string, ProviderInfo>> {
  const providers: Record<string, ProviderInfo> = {};

  const tasks: Promise<void>[] = [];

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const googleKey = process.env.GOOGLE_API_KEY;
  const ollamaUrl = config.ai.ollamaUrl;
  const ollamaRemoteUrl = config.ai.ollamaRemoteUrl;

  // Anthropic
  if (anthropicKey) {
    tasks.push(
      fetchAnthropicModels(anthropicKey).then((models) => {
        providers.anthropic = { available: true, models };
      })
    );
  } else {
    providers.anthropic = { available: false, models: FALLBACK_MODELS.anthropic! };
  }

  // OpenAI
  if (openaiKey) {
    tasks.push(
      fetchOpenAIModels(openaiKey).then((models) => {
        providers.openai = { available: true, models };
      })
    );
  } else {
    providers.openai = { available: false, models: FALLBACK_MODELS.openai! };
  }

  // Gemini
  if (googleKey) {
    tasks.push(
      fetchGeminiModels(googleKey).then((models) => {
        providers.gemini = { available: true, models };
      })
    );
  } else {
    providers.gemini = { available: false, models: FALLBACK_MODELS.gemini! };
  }

  // Ollama (local)
  if (ollamaUrl) {
    tasks.push(
      fetchOllamaModels(ollamaUrl)
        .then((models) => {
          providers.ollama = { available: models.length > 0, models };
        })
        .catch(() => {
          providers.ollama = { available: false, models: [] };
        })
    );
  } else {
    providers.ollama = { available: false, models: [] };
  }

  // Ollama (remote)
  if (ollamaRemoteUrl) {
    tasks.push(
      fetchOllamaModels(ollamaRemoteUrl)
        .then((models) => {
          providers['ollama-remote'] = { available: models.length > 0, models };
        })
        .catch(() => {
          providers['ollama-remote'] = { available: false, models: [] };
        })
    );
  } else {
    providers['ollama-remote'] = { available: false, models: [] };
  }

  await Promise.all(tasks);
  return providers;
}

export async function GET() {
  await requireAuthApi();

  // Return cached data if fresh
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json({ providers: cache.data });
  }

  const providers = await fetchAllModels();
  cache = { data: providers, timestamp: Date.now() };
  return NextResponse.json({ providers });
}
