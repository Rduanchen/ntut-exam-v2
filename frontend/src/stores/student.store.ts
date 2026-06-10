import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import { socket } from '../plugins/socket';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export const useStudentStore = defineStore('student', () => {
  const students = ref<any[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Setup socket listener for real-time updates
  socket.on('data-update', (payload: any) => {
    if (payload && payload.type === 'student') {
      fetchStudents();
    }
  });

  async function fetchStudents() {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/device`);
      students.value = res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to fetch students';
    } finally {
      loading.value = false;
    }
  }

  async function resetDeviceBinding(testId: string) {
    loading.value = true;
    error.value = null;
    try {
      await axios.put(`${BACKEND_URL}/admin/users/${testId}/reset-device`);
      await fetchStudents();
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to reset device';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchStudentCode(testId: string) {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/submissions/${testId}/code`);
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to fetch student code';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function reevaluateStudentCode(testId: string) {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.post(`${BACKEND_URL}/admin/judger/judge/${testId}`);
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to re-evaluate student code';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function exportStudentCodeZip(testId: string) {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/submissions/${testId}/export`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${testId}_codes.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      error.value = 'Failed to export student code zip';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    students,
    loading,
    error,
    fetchStudents,
    resetDeviceBinding,
    fetchStudentCode,
    reevaluateStudentCode,
    exportStudentCodeZip
  };
});
