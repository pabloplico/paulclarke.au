import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  notFound,
} from '@tanstack/react-router';
import { RootLayout } from '@/components/layout/RootLayout';
import { NotFoundPage, RouteErrorPage } from '@/components/layout/StatusPages';
import { AboutSection } from '@/components/sections/AboutSection';
import { ContactSection } from '@/components/sections/ContactSection';
import { HeroSection } from '@/components/sections/HeroSection';
import { PostsSection } from '@/components/sections/PostsSection';
import { ProjectsSection } from '@/components/sections/ProjectsSection';
import { PostListSkeleton } from '@/components/sections/posts/PostList';
import { PostNotFound } from '@/components/sections/posts/PostNotFound';
import { PostNotFoundError, postQuery, postsQuery } from '@/lib/api/posts';

// Code-based route tree (no file-based codegen). Every page is a child of the root layout.

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HeroSection,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects',
  component: ProjectsSection,
});

const assessmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/assessment',
}).lazy(() => import('./routes/assessment.lazy').then((m) => m.Route));

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: AboutSection,
});

const writingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/writing',
  // Fetch (or reuse cached) posts before rendering, so the page renders complete
  loader: ({ context }) => context.queryClient.ensureQueryData(postsQuery),
  component: PostsSection,
  pendingComponent: PostListSkeleton,
});

const postRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/writing/$slug',
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(postQuery(params.slug));
    } catch (error) {
      if (error instanceof PostNotFoundError) throw notFound();
      throw error;
    }
  },
  notFoundComponent: PostNotFound,
}).lazy(() => import('./routes/post.lazy').then((m) => m.Route));

const contactRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contact',
  component: ContactSection,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  projectsRoute,
  assessmentRoute,
  aboutRoute,
  writingRoute,
  postRoute,
  contactRoute,
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    // Hovering or focusing a link preloads that page's code and data
    defaultPreload: 'intent',
    // TanStack Query owns caching; let the router always ask it
    defaultPreloadStaleTime: 0,
    // New pages start at the top; Back/Forward restore the previous scroll position
    scrollRestoration: true,
  });
}

// Registers the router's types, so <Link to="..."> and params are checked at compile time
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
