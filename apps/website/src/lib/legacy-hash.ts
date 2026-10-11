/**
 * The site used hash URLs (/#assess, /#posts/slug) before path routing. Map an old hash to
 * its new path so bookmarks and shared links keep working. Returns null if nothing applies.
 */
export function legacyHashToPath(hash: string): string | null {
  const cleaned = hash.replace(/^#/, '');
  if (!cleaned) return null;

  if (cleaned === 'assess' || cleaned.startsWith('assess/')) return '/assessment';
  if (cleaned === 'posts') return '/writing';
  if (cleaned.startsWith('posts/')) {
    const slug = cleaned.slice('posts/'.length);
    return slug ? `/writing/${slug}` : '/writing';
  }
  if (['projects', 'about', 'contact'].includes(cleaned)) return `/${cleaned}`;
  // Sections that no longer exist
  if (cleaned === 'home' || cleaned.startsWith('services') || cleaned === 'insights') return '/';

  return null; // an in-page anchor such as #main: leave it alone
}
