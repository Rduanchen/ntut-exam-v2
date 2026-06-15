import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import { socket } from '../plugins/socket';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export const useScoreStore = defineStore('score', () => {
  const submissions = ref<any[]>([]);
  const scores = ref<any[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Setup socket listener for real-time score updates
  socket.on('score-update', () => {
    fetchSubmissions();
    fetchScores(true);
  });

  socket.on('data-update', (payload: any) => {
    if (payload && payload.type === 'score') {
      fetchSubmissions();
      fetchScores(true);
    }
  });

  async function fetchSubmissions() {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/submissions`);
      submissions.value = res.data.submissions || res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to fetch submissions';
    } finally {
      loading.value = false;
    }
  }

  async function rejudge(testId?: string) {
    loading.value = true;
    error.value = null;
    try {
      await axios.post(`${BACKEND_URL}/admin/judger/rejudge`, { testId });
      await fetchSubmissions();
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to trigger rejudge';
    } finally {
      loading.value = false;
    }
  }

  async function fetchScores(silent = false) {
    if (!silent) loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/scores`);
      scores.value = res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to fetch scores';
    } finally {
      if (!silent) loading.value = false;
    }
  }

  return {
    submissions,
    scores,
    loading,
    error,
    fetchSubmissions,
    fetchScores,
    rejudge
  };
});
