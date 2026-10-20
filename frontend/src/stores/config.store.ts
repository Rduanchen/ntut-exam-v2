import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import { useManageStore } from './manage.store';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export const useConfigStore = defineStore('config', () => {
  const config = ref<any>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const isInitialized = ref(false);

  async function fetchConfig() {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/config`);
      config.value = res.data;
    } catch (err: any) {
      if (err.response?.status === 404 && err.response?.data?.error === 'CONFIG_NOT_INITIALIZED') {
        config.value = {
          testTitle: "",
          description: "",
          judgerSettings: {
            timeLimit: 1000,
            memoryLimit: 256,
            compareMode: "strict",
          },
          submitGraceSeconds: 60,
          accessibleUsers: [],
          sections: []
        };
      } else {
        error.value = err.response?.data?.error || err.message || '無法載入設定';
      }
    } finally {
      loading.value = false;
    }
  }

  async function saveConfig(newConfig: any) {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.put(`${BACKEND_URL}/admin/config`, newConfig);
      config.value = res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || '無法儲存設定';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchInitStatus() {
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/init/init-status`);
      isInitialized.value = res.data.isInitialized;
    } catch (err: any) {
      console.error('Failed to fetch init status', err);
    }
  }

  async function initializeDatabase() {
    loading.value = true;
    error.value = null;
    try {
      await axios.post(`${BACKEND_URL}/admin/init`);
      isInitialized.value = true;
      /* Ask rather than assume. Initialisation advances the phase on the
       * backend, and hardcoding what it becomes here is how the console ends up
       * disagreeing with the server about where the exam is. */
      await useManageStore().fetchExamState();
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || '無法初始化資料庫';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function resetDatabase() {
    loading.value = true;
    error.value = null;
    try {
      await axios.post(`${BACKEND_URL}/admin/init/reset`, {
        confirm: "RESET"
      });
      isInitialized.value = false;
      await useManageStore().fetchExamState();
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || '無法重設資料庫';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    config,
    loading,
    error,
    isInitialized,
    fetchConfig,
    saveConfig,
    fetchInitStatus,
    initializeDatabase,
    resetDatabase
  };
});
