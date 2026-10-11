import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockReturning = vi.hoisted(() => vi.fn());
const mockValues = vi.hoisted(() => vi.fn(() => ({ returning: mockReturning })));
const mockInsert = vi.hoisted(() => vi.fn(() => ({ values: mockValues })));
const mockDb = vi.hoisted(() => ({ insert: mockInsert }));

// ── vi.mock calls ─────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({ db: mockDb }));

vi.mock('@/lib/db/schema', () => ({
  adminWorkspaces: {},
  adminWorkspaceSections: {},
  adminSectionVersions: {},
}));

// ── Subject ───────────────────────────────────────────────────────────────────

import { seedDefaultWorkspace } from './seed-default-workspace';

// ── Call index map (discovered by inspecting actual execution) ─────────────────
//
// The source loops: for each section → insert section → insert version
// So mockValues.mock.calls are interleaved in this order:
//   [0]  workspace insert values
//   [1]  section 1 (welcome) values
//   [2]  version 1 (welcome) values
//   [3]  section 2 (example-cards) values
//   [4]  version 2 (example-cards) values
//   [5]  section 3 (example-table) values
//   [6]  version 3 (example-table) values
//   [7]  section 4 (example-checklist) values
//   [8]  version 4 (example-checklist) values
//   [9]  section 5 (example-kv) values
//   [10] version 5 (example-kv) values

const SECTION_INDICES = [1, 3, 5, 7, 9]; // mockValues.mock.calls indices for sections
const VERSION_INDICES = [2, 4, 6, 8, 10]; // mockValues.mock.calls indices for versions
const SECTION_SLUGS = [
  'welcome',
  'example-cards',
  'example-table',
  'example-checklist',
  'example-kv',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Set up mockReturning for the happy path:
 * - First call (workspace): returns a workspace row
 * - Next 5 calls (sections): each returns a section row with incrementing ids
 * - Remaining calls (versions): returns [] (not consumed by source)
 */
function setupHappyPath(workspaceId = 10) {
  mockReturning
    .mockResolvedValueOnce([{ id: workspaceId }]) // workspace
    .mockResolvedValueOnce([{ id: 101 }]) // section 1
    .mockResolvedValueOnce([{ id: 102 }]) // section 2
    .mockResolvedValueOnce([{ id: 103 }]) // section 3
    .mockResolvedValueOnce([{ id: 104 }]) // section 4
    .mockResolvedValueOnce([{ id: 105 }]) // section 5
    .mockResolvedValue([]); // version returning calls (not used)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('seedDefaultWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockImplementation(() => ({ values: mockValues }));
    mockValues.mockImplementation(() => ({ returning: mockReturning }));
  });

  // ── Happy path ───────────────────────────────────────────────────────────

  describe('TC-019-A1 — workspace insert uses correct values for given userId', () => {
    it('inserts workspace with correct slug, title, icon, sortOrder, and userId', async () => {
      setupHappyPath();

      await seedDefaultWorkspace(42);

      const workspaceArg = (mockValues.mock.calls as any[][])[0]![0];
      expect(workspaceArg.slug).toBe('getting-started-u42');
      expect(workspaceArg.title).toBe('Getting Started');
      expect(workspaceArg.icon).toBe('rocket');
      expect(workspaceArg.sortOrder).toBe(0);
      expect(workspaceArg.userId).toBe(42);
    });
  });

  describe('TC-019-A2 — inserts exactly 5 sections', () => {
    it('calls db.insert for sections exactly 5 times', async () => {
      setupHappyPath();

      await seedDefaultWorkspace(1);

      // Total: 1 workspace + 5 sections + 5 versions = 11
      expect(mockInsert).toHaveBeenCalledTimes(11);

      const sectionArgs = SECTION_INDICES.map((i) => (mockValues.mock.calls as any[][])[i]![0]);
      expect(sectionArgs).toHaveLength(5);
      // All section args have a workspaceId (not sectionId)
      for (const arg of sectionArgs) {
        expect(arg.workspaceId).toBeDefined();
        expect(arg.sectionId).toBeUndefined();
      }
    });
  });

  describe('TC-019-A3 — inserts exactly 5 section versions', () => {
    it('calls db.insert for versions exactly 5 times', async () => {
      setupHappyPath();

      await seedDefaultWorkspace(1);

      const versionArgs = VERSION_INDICES.map((i) => (mockValues.mock.calls as any[][])[i]![0]);
      expect(versionArgs).toHaveLength(5);
      // All version args have a sectionId (not workspaceId)
      for (const arg of versionArgs) {
        expect(arg.sectionId).toBeDefined();
        expect(arg.workspaceId).toBeUndefined();
      }
    });
  });

  describe('TC-019-A4 — each version has correct metadata fields', () => {
    it('sets version=1, changeSource="manual", changeDescription="Initial content"', async () => {
      setupHappyPath();

      await seedDefaultWorkspace(1);

      const versionArgs = VERSION_INDICES.map((i) => (mockValues.mock.calls as any[][])[i]![0]);
      for (const arg of versionArgs) {
        expect(arg.version).toBe(1);
        expect(arg.changeSource).toBe('manual');
        expect(arg.changeDescription).toBe('Initial content');
      }
    });
  });

  describe('TC-019-A5 — each section is linked to the returned workspace id', () => {
    it('sets workspaceId=99 on all 5 section inserts', async () => {
      mockReturning
        .mockResolvedValueOnce([{ id: 99 }]) // workspace
        .mockResolvedValueOnce([{ id: 101 }])
        .mockResolvedValueOnce([{ id: 102 }])
        .mockResolvedValueOnce([{ id: 103 }])
        .mockResolvedValueOnce([{ id: 104 }])
        .mockResolvedValueOnce([{ id: 105 }])
        .mockResolvedValue([]);

      await seedDefaultWorkspace(1);

      const sectionArgs = SECTION_INDICES.map((i) => (mockValues.mock.calls as any[][])[i]![0]);
      for (const arg of sectionArgs) {
        expect(arg.workspaceId).toBe(99);
      }
    });
  });

  describe('TC-019-A6 — each version is linked to the correct section id', () => {
    it('uses sectionId from the corresponding section insert return', async () => {
      mockReturning
        .mockResolvedValueOnce([{ id: 10 }]) // workspace
        .mockResolvedValueOnce([{ id: 101 }]) // section 1
        .mockResolvedValueOnce([{ id: 102 }]) // section 2
        .mockResolvedValueOnce([{ id: 103 }]) // section 3
        .mockResolvedValueOnce([{ id: 104 }]) // section 4
        .mockResolvedValueOnce([{ id: 105 }]) // section 5
        .mockResolvedValue([]);

      await seedDefaultWorkspace(1);

      const versionArgs = VERSION_INDICES.map((i) => (mockValues.mock.calls as any[][])[i]![0]);
      expect(versionArgs[0]!.sectionId).toBe(101);
      expect(versionArgs[1]!.sectionId).toBe(102);
      expect(versionArgs[2]!.sectionId).toBe(103);
      expect(versionArgs[3]!.sectionId).toBe(104);
      expect(versionArgs[4]!.sectionId).toBe(105);
    });
  });

  describe('TC-019-A7 — welcome section version has non-null content', () => {
    it('sets content to a non-empty string for the prose welcome section', async () => {
      setupHappyPath();

      await seedDefaultWorkspace(1);

      // welcome is SECTION_SLUGS[0], version index VERSION_INDICES[0] = 2
      const welcomeVersionArg = (mockValues.mock.calls as any[][])[VERSION_INDICES[0]!]![0];
      expect(typeof welcomeVersionArg.content).toBe('string');
      expect(welcomeVersionArg.content.length).toBeGreaterThan(0);
    });
  });

  describe('TC-019-A8 — example-cards version has structuredData.items', () => {
    it('sets structuredData with a non-empty items array for the cards section', async () => {
      setupHappyPath();

      await seedDefaultWorkspace(1);

      // example-cards is SECTION_SLUGS[1], version index VERSION_INDICES[1] = 4
      const cardsVersionArg = (mockValues.mock.calls as any[][])[VERSION_INDICES[1]!]![0];
      expect(Array.isArray(cardsVersionArg.structuredData?.items)).toBe(true);
      expect(cardsVersionArg.structuredData.items.length).toBeGreaterThan(0);
    });
  });

  // ── Error cases ───────────────────────────────────────────────────────────

  describe('TC-019-E1 — returns early when workspace insert returns empty array', () => {
    it('performs no section inserts when workspace row is missing', async () => {
      mockReturning.mockResolvedValue([]);

      await seedDefaultWorkspace(1);

      // Only one insert call: the workspace insert — no sections or versions
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });
  });

  // ── Boundary cases ────────────────────────────────────────────────────────

  describe('TC-019-B1 — sections are inserted in sortOrder 0 through 4', () => {
    it('inserts sections with ascending sortOrder values', async () => {
      setupHappyPath();

      await seedDefaultWorkspace(1);

      const sectionArgs = SECTION_INDICES.map((i) => (mockValues.mock.calls as any[][])[i]![0]);
      expect(sectionArgs[0]!.sortOrder).toBe(0);
      expect(sectionArgs[1]!.sortOrder).toBe(1);
      expect(sectionArgs[2]!.sortOrder).toBe(2);
      expect(sectionArgs[3]!.sortOrder).toBe(3);
      expect(sectionArgs[4]!.sortOrder).toBe(4);
    });
  });

  describe('TC-019-B2 — section slugs are the expected five values in order', () => {
    it('inserts sections with correct slugs in the correct order', async () => {
      setupHappyPath();

      await seedDefaultWorkspace(1);

      const sectionArgs = SECTION_INDICES.map((i) => (mockValues.mock.calls as any[][])[i]![0]);
      const slugs = sectionArgs.map((arg) => arg.slug);
      expect(slugs).toEqual(SECTION_SLUGS);
    });
  });

  describe('TC-019-B3 — content is null for sections with no content property', () => {
    it('sets content=null for the example-cards section version', async () => {
      setupHappyPath();

      await seedDefaultWorkspace(1);

      // example-cards version index: VERSION_INDICES[1] = 4
      const cardsVersionArg = (mockValues.mock.calls as any[][])[VERSION_INDICES[1]!]![0];
      expect(cardsVersionArg.content).toBeNull();
    });
  });

  describe('TC-019-B4 — structuredData is null for the prose welcome section', () => {
    it('sets structuredData=null for the welcome section version', async () => {
      setupHappyPath();

      await seedDefaultWorkspace(1);

      // welcome version index: VERSION_INDICES[0] = 2
      const welcomeVersionArg = (mockValues.mock.calls as any[][])[VERSION_INDICES[0]!]![0];
      expect(welcomeVersionArg.structuredData).toBeNull();
    });
  });
});
