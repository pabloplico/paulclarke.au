import { requireAuth } from '@/lib/auth/server';
import { FeedsView } from './feeds-view';

export default async function FeedsPage() {
  await requireAuth();
  return <FeedsView />;
}
