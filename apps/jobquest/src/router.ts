import type { QueryClient } from '@tanstack/vue-query';
import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouterHistory,
} from 'vue-router';
import { jobsResource, skillsResource } from './composables/resources';
import { landingRoute } from './lib/landing';
import { navLabel } from './navigation';
import AddJobView from './views/AddJobView.vue';
import JobDetailView from './views/JobDetailView.vue';
import JobsView from './views/JobsView.vue';
import LandingView from './views/LandingView.vue';
import NotFoundView from './views/NotFoundView.vue';
import SkillsView from './views/SkillsView.vue';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
  }
}

export const routes: RouteRecordRaw[] = [
  // Redirects to the first unfinished step (beforeEach below); shown only if that fails
  { path: '/', name: 'home', component: LandingView },
  { path: '/skills', name: 'skills', component: SkillsView, meta: { title: navLabel('skills') } },
  { path: '/jobs', name: 'jobs', component: JobsView, meta: { title: navLabel('jobs') } },
  {
    path: '/jobs/new',
    name: 'add-job',
    component: AddJobView,
    meta: { title: navLabel('add-job') },
  },
  { path: '/jobs/:jobId', name: 'job', component: JobDetailView, props: true },
  {
    path: '/analytics',
    name: 'analytics',
    // Lazy, as is Taxonomy: the charts (ECharts) load only when someone opens Analytics
    component: () => import('./views/AnalyticsView.vue'),
    meta: { title: navLabel('analytics') },
  },
  {
    path: '/taxonomy',
    name: 'taxonomy',
    component: () => import('./views/TaxonomyView.vue'),
    meta: { title: navLabel('taxonomy') },
  },
  // The Worker serves index.html for every deep link, so unknown paths land here
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundView,
    meta: { title: 'Page not found' },
  },
];

export function createAppRouter(
  queryClient: QueryClient,
  history: RouterHistory = createWebHistory()
) {
  const router = createRouter({ history, routes });

  router.beforeEach(async (to) => {
    if (to.name !== 'home') return true;
    try {
      const [skills, jobs] = await Promise.all([
        queryClient.ensureQueryData(skillsResource.queryOptions),
        queryClient.ensureQueryData(jobsResource.queryOptions),
      ]);
      return {
        name: landingRoute({ skillCount: skills.length, jobCount: jobs.length }),
        replace: true,
      };
    } catch {
      // Signed out or the server is down: stay on / and let LandingView say so
      return true;
    }
  });

  router.afterEach((to) => {
    document.title = to.meta.title ? `${to.meta.title} · JobQuest` : 'JobQuest';
  });

  return router;
}
