import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mock state (available inside vi.mock factories) ─────────────────

const { selectResult, insertCalls, updateCalls, mockDb } = vi.hoisted(() => {
  const selectResult = { current: [] as unknown[] };
  const insertCalls = { current: [] as unknown[] };
  const updateCalls = { current: [] as unknown[] };

  const mockDb = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(selectResult.current)),
        })),
        // select().from(table) without .where() — used by getSettings
        then: (_resolve: (v: unknown) => void) => _resolve(selectResult.current),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((vals: unknown) => {
        insertCalls.current.push(vals);
        return Promise.resolve();
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((vals: unknown) => {
        updateCalls.current.push(vals);
        return { where: vi.fn(() => Promise.resolve()) };
      }),
    })),
  };

  return { selectResult, insertCalls, updateCalls, mockDb };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/schema', () => ({
  adminSettings: { id: 'id', key: 'key', value: 'value', updatedAt: 'updatedAt' },
}));
vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
}));

import { getSetting, getSettings, updateSettings } from './settings';

beforeEach(() => {
  selectResult.current = [];
  insertCalls.current = [];
  updateCalls.current = [];
  vi.clearAllMocks();
});

// ── getSettings ─────────────────────────────────────────────────────────────

describe('getSettings', () => {
  it('returns empty object when DB has no rows', async () => {
    selectResult.current = [];
    const result = await getSettings();
    expect(result).toEqual({});
  });

  it('returns key→value map from DB rows', async () => {
    selectResult.current = [
      { key: 'ai.provider', value: 'openai' },
      { key: 'rag.topK', value: 10 },
    ];
    const result = await getSettings();
    expect(result).toEqual({
      'ai.provider': 'openai',
      'rag.topK': 10,
    });
  });

  it('handles single row', async () => {
    selectResult.current = [{ key: 'ai.model', value: 'gpt-4o' }];
    const result = await getSettings();
    expect(result).toEqual({ 'ai.model': 'gpt-4o' });
  });

  it('preserves complex values (arrays, objects)', async () => {
    selectResult.current = [{ key: 'custom', value: { nested: [1, 2, 3] } }];
    const result = await getSettings();
    expect(result.custom).toEqual({ nested: [1, 2, 3] });
  });

  it('calls db.select().from(adminSettings)', async () => {
    selectResult.current = [];
    await getSettings();
    expect(mockDb.select).toHaveBeenCalled();
  });
});

// ── getSetting ──────────────────────────────────────────────────────────────

describe('getSetting', () => {
  it('returns value when key exists', async () => {
    selectResult.current = [{ key: 'ai.model', value: 'gpt-4o' }];
    const result = await getSetting('ai.model');
    expect(result).toBe('gpt-4o');
  });

  it('returns undefined when key does not exist', async () => {
    selectResult.current = [];
    const result = await getSetting('nonexistent');
    expect(result).toBeUndefined();
  });

  it('returns numeric values correctly', async () => {
    selectResult.current = [{ key: 'rag.topK', value: 10 }];
    const result = await getSetting('rag.topK');
    expect(result).toBe(10);
  });

  it('returns boolean values correctly', async () => {
    selectResult.current = [{ key: 'feature.enabled', value: true }];
    const result = await getSetting('feature.enabled');
    expect(result).toBe(true);
  });
});

// ── updateSettings ──────────────────────────────────────────────────────────

describe('updateSettings', () => {
  it('inserts new settings when key does not exist', async () => {
    selectResult.current = []; // no existing row
    await updateSettings({ 'ai.model': 'gpt-4o' });
    expect(mockDb.insert).toHaveBeenCalled();
    expect(insertCalls.current).toHaveLength(1);
    expect(insertCalls.current[0]).toEqual({ key: 'ai.model', value: 'gpt-4o' });
  });

  it('updates existing settings when key exists', async () => {
    selectResult.current = [{ id: 1 }]; // existing row found
    await updateSettings({ 'ai.model': 'gpt-4o' });
    expect(mockDb.update).toHaveBeenCalled();
    expect(updateCalls.current).toHaveLength(1);
    expect(updateCalls.current[0]).toMatchObject({ value: 'gpt-4o' });
    expect(updateCalls.current[0]).toHaveProperty('updatedAt');
  });

  it('handles multiple updates in a single call', async () => {
    let callCount = 0;
    mockDb.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => {
            callCount++;
            return Promise.resolve<unknown[]>(callCount === 1 ? [{ id: 1 }] : []);
          }),
        })),
        // Same shape as the factory's mock (Vitest 5 types the replacement against it)
        then: (_resolve: (v: unknown) => void) => _resolve(selectResult.current),
      })),
    }));

    await updateSettings({
      'ai.provider': 'openai',
      'rag.chunkSize': 2000,
    });

    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('does nothing with empty updates object', async () => {
    await updateSettings({});
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
