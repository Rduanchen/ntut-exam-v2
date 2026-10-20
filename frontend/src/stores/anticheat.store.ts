import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import { socket } from '../plugins/socket';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export const useAnticheatStore = defineStore('anticheat', () => {
  const alerts = ref<any[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Setup socket listener for real-time cheat warnings
  socket.on('new-alert', (payload: any) => {
    if (payload && payload.result) {
      alerts.value.unshift(payload.result); // Add newest to top
    }
  });

  async function fetchAlerts() {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/anticheat/logs`);
      alerts.value = Array.isArray(res.data) ? res.data : (res.data.alerts || res.data || []);
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || '無法取得警告紀錄';
    } finally {
      loading.value = false;
    }
  }

  async function toggleAlertStatus(violationId: number, isOk: boolean) {
    error.value = null;
    try {
      await axios.put(`${BACKEND_URL}/admin/anticheat/status`, {
        violationId,
        isOk
      });
      const index = alerts.value.findIndex((item) => item.id === violationId);
      if (index !== -1) {
        alerts.value[index].isOk = isOk;
      }
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || '無法更新警告狀態';
      throw err;
    }
  }

  return {
    alerts,
    loading,
    error,
    fetchAlerts,
    toggleAlertStatus
  };
});
