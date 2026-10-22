import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import { socket } from '../plugins/socket';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export const useConnectionStore = defineStore('connection', () => {
  const devices = ref<any[]>([]);
  const loginRequests = ref<any[]>([]);
  const allowRegistration = ref<boolean>(true);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Setup socket listener for real-time updates
  socket.on('data-update', (payload: any) => {
    if (payload && payload.type === 'connection') {
      fetchDevices();
      fetchLoginRequests();
    }
  });

  const getHeaders = () => {
    const token = import.meta.env.VITE_ADMIN_TOKEN;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  async function fetchSettings() {
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/connection/settings`, { headers: getHeaders() });
      allowRegistration.value = res.data.allowRegistration;
    } catch (err: any) {
      console.error('Failed to load settings', err);
    }
  }

  async function updateSettings(allow: boolean) {
    try {
      await axios.post(`${BACKEND_URL}/admin/connection/settings`, { allowRegistration: allow }, { headers: getHeaders() });
      allowRegistration.value = allow;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to update settings';
    }
  }

  async function fetchDevices() {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/connection/devices`, { headers: getHeaders() });
      devices.value = res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to load device connections';
    } finally {
      loading.value = false;
    }
  }

  async function fetchLoginRequests() {
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/connection/requests`, { headers: getHeaders() });
      loginRequests.value = res.data;
    } catch (err: any) {
      console.error('Failed to load login requests', err);
    }
  }

  async function approveRequest(id: number, mode: 'SAME_USER' | 'NEW_USER'): Promise<boolean> {
    try {
      await axios.post(
        `${BACKEND_URL}/admin/connection/requests/${id}/approve`,
        { mode },
        { headers: getHeaders() }
      );
      await fetchLoginRequests();
      await fetchDevices();
      return true;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || '無法核准連線請求';
      return false;
    }
  }

  async function rejectRequest(id: number) {
    try {
      await axios.post(`${BACKEND_URL}/admin/connection/requests/${id}/reject`, {}, { headers: getHeaders() });
      await fetchLoginRequests();
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || '無法拒絕連線請求';
    }
  }

  async function unbindDevice(uuid: string) {
    try {
      await axios.post(`${BACKEND_URL}/admin/connection/devices/${uuid}/unbind`, {}, { headers: getHeaders() });
      await fetchDevices();
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || '無法解除設備綁定';
    }
  }

  async function unregisterDevice(uuid: string) {
    try {
      await axios.delete(`${BACKEND_URL}/admin/connection/devices/${uuid}`, { headers: getHeaders() });
      await fetchDevices();
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || '無法註銷設備';
      throw err;
    }
  }

  return {
    devices,
    loginRequests,
    allowRegistration,
    loading,
    error,
    fetchSettings,
    updateSettings,
    fetchDevices,
    fetchLoginRequests,
    approveRequest,
    rejectRequest,
    unbindDevice,
    unregisterDevice
  };
});
