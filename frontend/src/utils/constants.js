/** Libelles, couleurs et enchainements des statuts de commande. */

export const ORDER_STATUS = {
  NEW: {
    key: 'NEW',
    label: 'Nouvelle',
    clientLabel: 'Commande recue',
    badge: 'bg-sky-100 text-sky-700',
    dot: 'bg-sky-500',
    next: 'ACCEPTED',
    nextLabel: 'Accepter',
  },
  ACCEPTED: {
    key: 'ACCEPTED',
    label: 'Acceptee',
    clientLabel: 'Acceptee',
    badge: 'bg-indigo-100 text-indigo-700',
    dot: 'bg-indigo-500',
    next: 'PREPARING',
    nextLabel: 'En preparation',
  },
  PREPARING: {
    key: 'PREPARING',
    label: 'En preparation',
    clientLabel: 'En preparation',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
    next: 'READY',
    nextLabel: 'Marquer prete',
  },
  READY: {
    key: 'READY',
    label: 'Prete',
    clientLabel: 'Prete',
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
    next: 'SERVED',
    nextLabel: 'Marquer servie',
  },
  SERVED: {
    key: 'SERVED',
    label: 'Servie',
    clientLabel: 'Servie',
    badge: 'bg-ink-100 text-ink-600',
    dot: 'bg-ink-400',
    next: null,
    nextLabel: null,
  },
  CANCELLED: {
    key: 'CANCELLED',
    label: 'Annulee',
    clientLabel: 'Annulee',
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
    next: null,
    nextLabel: null,
  },
};

/** Ordre du suivi affiche au client. */
export const CLIENT_TIMELINE = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'];

export const SERVICE_REQUEST_TYPE = {
  CALL_SERVER: { label: 'Appel serveuse', icon: 'Bell', color: 'text-amber-600 bg-amber-50' },
  BILL: { label: 'Demande d\'addition', icon: 'Receipt', color: 'text-sky-600 bg-sky-50' },
};

export const SERVICE_REQUEST_STATUS = {
  PENDING: { label: 'En attente', badge: 'bg-amber-100 text-amber-700', next: 'TAKEN', nextLabel: 'Prendre en charge' },
  TAKEN: { label: 'Prise en charge', badge: 'bg-indigo-100 text-indigo-700', next: 'COMPLETED', nextLabel: 'Terminer' },
  COMPLETED: { label: 'Terminee', badge: 'bg-ink-100 text-ink-600', next: null, nextLabel: null },
  REQUESTED: { label: 'Demandee', badge: 'bg-sky-100 text-sky-700', next: 'PROCESSING', nextLabel: 'Preparer l\'addition' },
  PROCESSING: { label: 'En cours', badge: 'bg-indigo-100 text-indigo-700', next: 'PAID', nextLabel: 'Marquer payee' },
  PAID: { label: 'Payee', badge: 'bg-emerald-100 text-emerald-700', next: null, nextLabel: null },
  CANCELLED: { label: 'Annulee', badge: 'bg-red-100 text-red-700', next: null, nextLabel: null },
};

export const PERIOD_OPTIONS = [
  { value: 'today', label: 'Aujourd\'hui' },
  { value: 'yesterday', label: 'Hier' },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'custom', label: 'Periode personnalisee' },
  { value: 'all', label: 'Tout' },
];

export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export const MONTHS = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
];

/** Cle de stockage du panier, propre a chaque table. */
export const cartKey = (tableToken) => `qrmenu.cart.${tableToken}`;
/** Commandes suivies par le client sur cette table. */
export const ordersKey = (tableToken) => `qrmenu.orders.${tableToken}`;
