import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
export const TOKEN_KEY = 'qrmenu.token';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 20000,
});

/** Ajoute automatiquement le jeton JWT sur chaque requete. */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Normalise les erreurs :
 * toute erreur remontee porte un message lisible en francais.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;

      // Session expiree : on nettoie et on renvoie vers la connexion,
      // sauf sur les pages publiques du client.
      if (status === 401 && localStorage.getItem(TOKEN_KEY)) {
        localStorage.removeItem(TOKEN_KEY);
        if (!window.location.pathname.startsWith('/menu')) {
          window.location.href = '/login';
        }
      }

      error.message = data?.message || 'Une erreur est survenue';
      error.fieldErrors = data?.errors || null;
      error.status = status;
    } else if (error.code === 'ECONNABORTED') {
      error.message = 'Le serveur met trop de temps a repondre';
    } else {
      error.message = 'Impossible de joindre le serveur. Verifiez votre connexion.';
      error.isNetwork = true;
    }
    return Promise.reject(error);
  }
);

/** Construit l'URL absolue d'une image stockee par l'API. */
export function imageUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_URL}${path}`;
}

export default api;
