import type { Db, DbTx } from '@/lib/db';
import {
  adminClients,
  adminJobs,
  adminSectionVersions,
  adminTodos,
  adminWorkspaceSections,
  adminWorkspaces,
} from '@/lib/db/schema';
import { DEMO_CLIENTS, DEMO_JOBS, DEMO_TODOS, DEMO_WORKSPACES } from './content';

export type SeededSection = { id: number; title: string; workspaceKey: string };
export type SeededWorkspace = { id: number; title: string; slug: string };

/** What seedDemoContent created, by the stable keys used in the fixtures. */
export type SeededContent = {
  workspaces: Map<string, SeededWorkspace>;
  /** Keyed `${workspaceKey}/${sectionSlug}`. */
  sections: Map<string, SeededSection>;
  clients: Map<string, number>;
};

/**
 * Inserts the hand-written Harbourside Bakery content for one user:
 * workspaces with sections and their version history, clients, jobs and
 * todos. Fresh rows every time, so each visitor gets their own copy.
 */
export async function seedDemoContent(conn: Db | DbTx, userId: number): Promise<SeededContent> {
  const seeded: SeededContent = { workspaces: new Map(), sections: new Map(), clients: new Map() };

  for (const [wsIndex, ws] of DEMO_WORKSPACES.entries()) {
    const [workspace] = await conn
      .insert(adminWorkspaces)
      .values({
        userId,
        slug: `${ws.key}-u${userId}`,
        title: ws.title,
        description: ws.description,
        icon: ws.icon,
        // After Getting Started (sortOrder 0)
        sortOrder: wsIndex + 1,
      })
      .returning();
    if (!workspace) throw new Error(`Demo seed: workspace ${ws.key} wasn't created`);
    seeded.workspaces.set(ws.key, {
      id: workspace.id,
      title: workspace.title,
      slug: workspace.slug,
    });

    for (const [sortOrder, sec] of ws.sections.entries()) {
      const [section] = await conn
        .insert(adminWorkspaceSections)
        .values({
          workspaceId: workspace.id,
          slug: sec.slug,
          title: sec.title,
          description: sec.description,
          template: sec.template,
          sortOrder,
        })
        .returning();
      if (!section) throw new Error(`Demo seed: section ${sec.slug} wasn't created`);
      seeded.sections.set(`${ws.key}/${sec.slug}`, {
        id: section.id,
        title: section.title,
        workspaceKey: ws.key,
      });

      // Spread over the past few days, oldest first, so version history reads naturally
      const total = sec.versions.length;
      for (const [i, v] of sec.versions.entries()) {
        await conn.insert(adminSectionVersions).values({
          sectionId: section.id,
          version: i + 1,
          content: v.content ?? null,
          structuredData: v.structuredData ?? null,
          changeDescription: v.changeDescription,
          changeSource: v.changeSource,
          createdAt: daysAgo(total - i),
        });
      }
    }
  }

  for (const c of DEMO_CLIENTS) {
    const { key, ...values } = c;
    const [client] = await conn
      .insert(adminClients)
      .values({ ...values, userId })
      .returning({ id: adminClients.id });
    if (client) seeded.clients.set(key, client.id);
  }

  for (const [sortOrder, j] of DEMO_JOBS.entries()) {
    const { client, ...values } = j;
    await conn
      .insert(adminJobs)
      .values({ ...values, userId, clientId: seeded.clients.get(client) ?? null, sortOrder });
  }

  for (const [sortOrder, t] of DEMO_TODOS.entries()) {
    const { client, ...values } = t;
    await conn.insert(adminTodos).values({
      ...values,
      userId,
      clientId: client ? (seeded.clients.get(client) ?? null) : null,
      sortOrder,
    });
  }

  return seeded;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
