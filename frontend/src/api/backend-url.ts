/**
 * Where the backend lives.
 *
 * The fallback is not optional. VITE_BACKEND_URL may be absent in a plain
 * `npm run dev`; without a fallback
 * every request becomes the relative path "undefined/admin/...", which the dev
 * server answers with index.html. axios then hands the caller an HTML string
 * that is truthy, so nothing throws at the fetch — the page breaks later, when
 * something reads a field off it, and it breaks mid-render.
 *
 * Kept in one place so the two api modules cannot diverge from each other the
 * way they diverged from the stores.
 */
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
