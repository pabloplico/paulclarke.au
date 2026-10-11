import { eq } from 'drizzle-orm';
import { Shell } from '@/components/layout/Shell';
import { getCurrentUser } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminKnowledgeBases, adminWorkspaces } from '@/lib/db/schema';
import { TypographyProvider } from '@/lib/workspaces/typography';

export const dynamic = 'force-dynamic';

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  // Load workspace + KB lists for the floating chat scope switcher
  const [workspaces, knowledgeBases] = await Promise.all([
    user
      ? db
          .select({
            id: adminWorkspaces.id,
            title: adminWorkspaces.title,
            slug: adminWorkspaces.slug,
          })
          .from(adminWorkspaces)
          .where(eq(adminWorkspaces.userId, user.id))
      : [],
    user
      ? db
          .select({ id: adminKnowledgeBases.id, name: adminKnowledgeBases.name })
          .from(adminKnowledgeBases)
          .where(eq(adminKnowledgeBases.userId, user.id))
      : [],
  ]);

  return (
    <TypographyProvider>
      <Shell userRole={user?.role} workspaces={workspaces} knowledgeBases={knowledgeBases}>
        {children}
      </Shell>
    </TypographyProvider>
  );
}
