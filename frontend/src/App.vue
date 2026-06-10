<script setup lang="ts">
import { ref } from 'vue';

const drawer = ref(true);

const navItems = [
  { title: 'Manage', icon: 'mdi-monitor-dashboard', to: '/manage' },
  { title: 'Config', icon: 'mdi-cog', to: '/config' },
  { title: 'Score', icon: 'mdi-format-list-numbered', to: '/score' },
  { title: 'Student', icon: 'mdi-account-group', to: '/student' },
  { title: 'Anti-Cheat', icon: 'mdi-shield-alert', to: '/anticheat' },
  { title: 'Logs', icon: 'mdi-text-box-search', to: '/log' },
  { title: 'Connection', icon: 'mdi-desktop-classic', to: '/connection' },
  { title: 'Device', icon: 'mdi-monitor-dashboard', to: '/device' },
];
</script>

<template>
  <v-app>
    <v-navigation-drawer v-model="drawer" app theme="dark">
      <v-list-item
        title="Admin Control Panel"
        subtitle="NTUT Exam System"
        class="py-4"
      ></v-list-item>
      <v-divider></v-divider>
      <v-list density="compact" nav>
        <v-list-item
          v-for="item in navItems"
          :key="item.title"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="item.title"
          color="primary"
          exact
        ></v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-app-bar app elevation="1">
      <v-app-bar-nav-icon @click="drawer = !drawer"></v-app-bar-nav-icon>
      <v-app-bar-title>NTUT Exam Platform</v-app-bar-title>
    </v-app-bar>

    <v-main>
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </v-main>
  </v-app>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
