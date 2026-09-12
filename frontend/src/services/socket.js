import { io } from 'socket.io-client';
import { API_URL, TOKEN_KEY } from './api';

let socket = null;
let currentToken = null;
let version = 0;
const versionListeners = new Set();

function notify() {
  version += 1;
  versionListeners.forEach((listener) => listener());
}

function create(token) {
  return io(API_URL, {
    auth: token ? { token } : {},
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionAttempts: Infinity,
  });
}

/**
 * Connexion Socket.IO partagee par toute l'application.
 * - Le personnel passe son JWT : il rejoint le salon de son restaurant.
 * - Le client se connecte sans jeton puis rejoint le salon de sa table.
 * Rappeler cette fonction avec un autre jeton remplace la connexion.
 */
export function connectSocket(token = null) {
  if (socket && currentToken === token) return socket;

  if (socket) socket.disconnect();
  currentToken = token;
  socket = create(token);
  notify();
  return socket;
}

/** Renvoie la connexion courante, en la creant si nécessaire. */
export function getSocket() {
  if (!socket) {
    currentToken = localStorage.getItem(TOKEN_KEY);
    socket = create(currentToken);
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
    notify();
  }
}

/** Utilise par les hooks React pour se reabonner quand la connexion change. */
export function subscribeToSocketChanges(listener) {
  versionListeners.add(listener);
  return () => versionListeners.delete(listener);
}

export function getSocketVersion() {
  return version;
}
