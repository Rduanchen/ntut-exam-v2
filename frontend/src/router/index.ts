import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/manage'
    },
    {
      path: '/judge',
      name: 'judge-settings',
      component: () => import('../views/judge/JudgeSettingsView.vue')
    },
    {
      path: '/config',
      name: 'config',
      component: () => import('../views/config/ConfigView.vue')
    },
    {
      path: '/score',
      name: 'score',
      component: () => import('../views/score/ScoreView.vue')
    },
    {
      path: '/student',
      name: 'student',
      component: () => import('../views/student/StudentView.vue')
    },
    {
      path: '/anticheat',
      name: 'anticheat',
      component: () => import('../views/anticheat/AnticheatView.vue')
    },
    {
      path: '/log',
      name: 'log',
      component: () => import('../views/log/LogView.vue')
    },
    {
      path: '/connection',
      name: 'connection',
      component: () => import('../views/connection/ConnectionView.vue')
    },
    {
      path: '/device',
      name: 'device',
      component: () => import('../views/device/DeviceView.vue')
    },
    {
      path: '/manage',
      name: 'manage',
      component: () => import('../views/manage/ManageView.vue')
    }
  ]
});

export default router;
