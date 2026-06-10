import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import { socket } from '../plugins/socket';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export const useLogStore = defineStore('log', () => {
  const logs = ref<any[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const totalItems = ref(0);

  // Setup socket listener for real-time updates
  socket.on('data-update', (payload: any) => {
    if (payload && payload.type === 'log') {
      fetchLogs();
    }
  });

  async function fetchLogs(page = 1, limit = 50, level?: string, search?: string) {
    loading.value = true;
    error.value = null;
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      });
      if (level) params.append('level', level);
      if (search) params.append('search', search);

      const res = await axios.get(`${BACKEND_URL}/admin/log?${params.toString()}`);
      logs.value = res.data.logs || res.data;
      totalItems.value = res.data.total || logs.value.length;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to fetch logs';
    } finally {
      loading.value = false;
    }
  }

  return {
    logs,
    loading,
    error,
    totalItems,
    fetchLogs
  };
});
