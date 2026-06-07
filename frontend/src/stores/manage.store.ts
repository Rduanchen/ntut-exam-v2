import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export const useManageStore = defineStore('manage', () => {
  const examState = ref<string>('NOT_STARTED');
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchExamState() {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/exam-state`);
      examState.value = res.data.state || res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.response?.data?.message || err.message;
    } finally {
      loading.value = false;
    }
  }

  async function setExamState(state: string) {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.post(`${BACKEND_URL}/admin/exam-state`, { state });
      examState.value = res.data.state || state;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.response?.data?.message || err.message;
    } finally {
      loading.value = false;
    }
  }

  async function broadcastMessage(message: string) {
    loading.value = true;
    error.value = null;
    try {
      await axios.post(`${BACKEND_URL}/admin/messages`, { message });
    } catch (err: any) {
      error.value = err.response?.data?.error || err.response?.data?.message || err.message;
    } finally {
      loading.value = false;
    }
  }

  return {
    examState,
    loading,
    error,
    fetchExamState,
    setExamState,
    broadcastMessage
  };
});
