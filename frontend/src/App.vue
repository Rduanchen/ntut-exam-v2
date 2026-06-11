<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const drawer = ref(true);
const systemWarnings = ref<string[]>([]);
const loadTestMode = ref<string>('disabled');

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

onMounted(async () => {
  try {
    const res = await axios.get(`${BACKEND_URL}/admin/system-info`);
    loadTestMode.value = res.data.loadTestMode || 'disabled';
    systemWarnings.value = res.data.warnings || [];
  } catch (err) {
    // Silently fail — banner just won't show
  }
});
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

    <!-- System Warning Banner -->
    <v-banner
      v-if="systemWarnings.length > 0"
      class="system-warning-banner"
      icon="mdi-alert-circle"
      color="error"
      sticky
    >
      <template #text>
        <div v-for="(warning, index) in systemWarnings" :key="index" class="warning-text">
          {{ warning }}
        </div>
        <div class="warning-subtext">
          LOAD_TEST_MODE = "{{ loadTestMode }}" — 如需關閉請修改 backend/.env 並重啟服務
        </div>
      </template>
    </v-banner>

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

.system-warning-banner {
  z-index: 1000;
}

.system-warning-banner .warning-text {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
}

.system-warning-banner .warning-subtext {
  font-size: 12px;
  opacity: 0.85;
  margin-top: 4px;
}
</style>

