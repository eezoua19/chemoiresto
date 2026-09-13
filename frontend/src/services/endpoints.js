import api from './api';

/**
 * Toutes les requetes HTTP de l'application sont regroupees ici.
 * Chaque fonction renvoie directement le champ "data" de la réponse standard.
 */

const unwrap = (response) => response.data.data;

// ------------------------------ Authentification ---------------------------
export const authApi = {
  login: (payload) => api.post('/auth/login', payload).then(unwrap),
  me: () => api.get('/auth/me').then(unwrap),
  logout: () => api.post('/auth/logout').then(unwrap),
};

// ------------------------------ Client (public) ----------------------------
export const publicApi = {
  getMenuByTable: (token) => api.get(`/menu/table/${token}`).then((r) => r.data),
  getTakeawayMenu: (token) => api.get(`/menu/emporter/${token}`).then((r) => r.data),
  getTableOrders: (token) => api.get(`/menu/table/${token}/orders`).then(unwrap),
  getTableServiceRequests: (token) => api.get(`/menu/table/${token}/service-requests`).then(unwrap),
  createOrder: (payload) => api.post('/orders', payload).then(unwrap),
  trackOrder: (trackingToken) => api.get(`/orders/track/${trackingToken}`).then(unwrap),
  createServiceRequest: (payload) => api.post('/service-requests', payload).then((r) => r.data),
  remindServiceRequest: (payload) =>
    api.post('/service-requests/remind', payload).then((r) => r.data),
};

// ------------------------------- Catégories --------------------------------
export const categoryApi = {
  list: () => api.get('/categories').then(unwrap),
  create: (payload) => api.post('/categories', payload).then(unwrap),
  update: (id, payload) => api.put(`/categories/${id}`, payload).then(unwrap),
  remove: (id) => api.delete(`/categories/${id}`).then(unwrap),
  reorder: (items) => api.put('/categories/reorder', { items }).then(unwrap),
};

// -------------------------------- Produits ---------------------------------
export const productApi = {
  list: (params) => api.get('/products', { params }).then(unwrap),
  detail: (id) => api.get(`/products/${id}`).then(unwrap),
  create: (formData) =>
    api.post('/products', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(unwrap),
  update: (id, formData) =>
    api
      .put(`/products/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(unwrap),
  toggleAvailability: (id) => api.patch(`/products/${id}/availability`).then(unwrap),
  remove: (id) => api.delete(`/products/${id}`).then((r) => r.data),
};

// --------------------------------- Tables ----------------------------------
export const tableApi = {
  list: () => api.get('/tables').then(unwrap),
  detail: (id) => api.get(`/tables/${id}`).then(unwrap),
  create: (payload) => api.post('/tables', payload).then(unwrap),
  update: (id, payload) => api.put(`/tables/${id}`, payload).then(unwrap),
  toggleStatus: (id) => api.patch(`/tables/${id}/status`).then(unwrap),
  remove: (id) => api.delete(`/tables/${id}`).then(unwrap),
  qrCode: (id) => api.get(`/tables/${id}/qrcode`).then(unwrap),
  generateQRCode: (id) => api.post(`/tables/${id}/qrcode`).then(unwrap),
  regenerateQRCode: (id) => api.post(`/tables/${id}/qrcode/regenerate`).then(unwrap),
  allQRCodes: () => api.get('/tables/qrcodes/all').then(unwrap),
};

// ---------------------------- Menus quotidiens -----------------------------
export const menuApi = {
  list: (params) => api.get('/menus', { params }).then(unwrap),
  today: () => api.get('/menus/today').then(unwrap),
  byDate: (date) => api.get(`/menus/date/${date}`).then(unwrap),
  detail: (id) => api.get(`/menus/${id}`).then(unwrap),
  create: (payload) => api.post('/menus', payload).then(unwrap),
  update: (id, payload) => api.put(`/menus/${id}`, payload).then(unwrap),
  remove: (id) => api.delete(`/menus/${id}`).then(unwrap),
  duplicate: (id, payload) => api.post(`/menus/${id}/duplicate`, payload).then((r) => r.data),
  // Raccourcis depuis la page Produits : rendre un plat commandable aujourd'hui.
  addProductToToday: (productId) => api.post('/menus/today/products', { productId }).then((r) => r.data),
  removeProductFromToday: (productId) =>
    api.delete(`/menus/today/products/${productId}`).then((r) => r.data),
};

// ------------------------------- Commandes ---------------------------------
export const orderApi = {
  list: (params) => api.get('/orders', { params }).then(unwrap),
  board: (params) => api.get('/orders/board', { params }).then(unwrap),
  detail: (id) => api.get(`/orders/${id}`).then(unwrap),
  updateStatus: (id, status, comment) =>
    api.put(`/orders/${id}/status`, { status, comment }).then(unwrap),
  assign: (id, serverId) => api.put(`/orders/${id}/assign`, { serverId }).then(unwrap),
};

// ------------------------------- Serveuses ---------------------------------
export const userApi = {
  list: () => api.get('/users/servers').then(unwrap),
  create: (payload) => api.post('/users/servers', payload).then(unwrap),
  update: (id, payload) => api.put(`/users/servers/${id}`, payload).then(unwrap),
  remove: (id) => api.delete(`/users/servers/${id}`).then((r) => r.data),
  resetPassword: (id, password) => api.put(`/users/servers/${id}/password`, { password }).then(unwrap),
  activity: (id) => api.get(`/users/servers/${id}/activity`).then(unwrap),
};

// ------------------------------- Tableau de bord ---------------------------
export const dashboardApi = {
  // `month` au format AAAA-MM ; absent = mois en cours.
  stats: (month) =>
    api.get('/dashboard/stats', { params: month ? { month } : undefined }).then(unwrap),
};

// --------------------------- Demandes de service ---------------------------
export const serviceRequestApi = {
  list: (params) => api.get('/service-requests', { params }).then(unwrap),
  updateStatus: (id, status) => api.put(`/service-requests/${id}/status`, { status }).then(unwrap),
};

// ------------------------------ Notifications ------------------------------
export const notificationApi = {
  list: (params) => api.get('/notifications', { params }).then(unwrap),
  markRead: (id) => api.put(`/notifications/${id}/read`).then(unwrap),
  markAllRead: () => api.put('/notifications/read-all').then(unwrap),
};

// ------------------------------- Abonnements -------------------------------
export const subscriptionApi = {
  list: (params) => api.get('/subscriptions', { params }).then(unwrap),
  stats: () => api.get('/subscriptions/stats').then(unwrap),
  detail: (id) => api.get(`/subscriptions/${id}`).then(unwrap),
  create: (payload) => api.post('/subscriptions', payload).then(unwrap),
  update: (id, payload) => api.put(`/subscriptions/${id}`, payload).then(unwrap),
  setStatus: (id, status) => api.patch(`/subscriptions/${id}/status`, { status }).then(unwrap),
  renew: (id, payload) => api.post(`/subscriptions/${id}/renew`, payload).then(unwrap),
  ticket: (id) => api.get(`/subscriptions/${id}/ticket`).then(unwrap),
  // Accessibles aussi aux serveuses : verification au comptoir.
  verify: (token) => api.get(`/subscriptions/verify/${token}`).then(unwrap),
  use: (token, payload) => api.post(`/subscriptions/verify/${token}/use`, payload).then(unwrap),
  lookup: (q) => api.get('/subscriptions/lookup', { params: { q } }).then(unwrap),
};

// -------------------------------- Restaurant -------------------------------
export const restaurantApi = {
  detail: () => api.get('/restaurant').then(unwrap),
  update: (formData) =>
    api.put('/restaurant', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(unwrap),
  setTakeaway: (payload) => api.patch('/restaurant/emporter', payload).then(unwrap),
};
