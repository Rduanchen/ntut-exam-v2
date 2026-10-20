import axios from 'axios';

// Interceptor to automatically attach the admin token to every request
axios.interceptors.request.use((config) => {
  const token = import.meta.env.VITE_ADMIN_TOKEN;
  
  if (token && config.url?.includes('/admin/')) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default axios;
