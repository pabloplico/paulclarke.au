import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import HomeView from './views/HomeView.vue';

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  // Unknown paths land here: the Worker serves index.html for every deep link
  { path: '/:pathMatch(.*)*', name: 'not-found', component: HomeView },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
