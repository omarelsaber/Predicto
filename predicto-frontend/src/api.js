import axios from 'axios';

/** Base origin for `/health`, `/api/v1/report` (print/PDF), and non-versioned routes. */
export const API_ORIGIN = import.meta.env.VITE_API_URL ?? 'http://localhost:8001';

const api = axios.create({
  baseURL: `${API_ORIGIN}/api/v1`,
});

export default api;
