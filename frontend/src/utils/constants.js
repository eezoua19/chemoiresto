/** Libelles, couleurs et enchainements des statuts de commande. */

export const ORDER_STATUS = {
  NEW: {
    key: 'NEW',
    label: 'Nouvelle',
    clientLabel: 'Commande reçue',
    badge: 'bg-sky-100 text-sky-700 dark:text-sky-400',
    dot: 'bg-sky-500',
    next: 'ACCEPTED',
    nextLabel: 'Accepter',
  },
  ACCEPTED: {
    key: 'ACCEPTED',
    label: 'Acceptée',
    clientLabel: 'Acceptée',
    badge: 'bg-indigo-100 text-indigo-700 dark:text-indigo-400',
    dot: 'bg-indigo-500',
    next: 'PREPARING',
    nextLabel: 'En préparation',
  },
  PREPARING: {
    key: 'PREPARING',
    label: 'En préparation',
    clientLabel: 'En préparation',
    badge: 'bg-amber-100 text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
    next: 'READY',
    nextLabel: 'Marquer prête',
  },
  READY: {
    key: 'READY',
    label: 'Prête',
    clientLabel: 'Prête',
    badge: 'bg-emerald-100 text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    next: 'SERVED',
    nextLabel: 'Marquer servie',
  },
  SERVED: {
    key: 'SERVED',
    label: 'Servie',
    clientLabel: 'Servie',
    badge: 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300',
    dot: 'bg-ink-400',
    next: null,
    nextLabel: null,
  },
  CANCELLED: {
    key: 'CANCELLED',
    label: 'Annulée',
    clientLabel: 'Annulée',
    badge: 'bg-red-100 text-red-700 dark:text-red-400',
    dot: 'bg-red-500',
    next: null,
    nextLabel: null,
  },
};

/** Ordre du suivi affiche au client. */
export const CLIENT_TIMELINE = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'];

export const SERVICE_REQUEST_TYPE = {
  CALL_SERVER: { label: 'Appel serveuse', icon: 'Bell', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
  BILL: { label: 'Demande d\'addition', icon: 'Receipt', color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/20' },
};

export const SERVICE_REQUEST_STATUS = {
  PENDING: { label: 'En attente', badge: 'bg-amber-100 text-amber-700 dark:text-amber-400', next: 'TAKEN', nextLabel: 'Prendre en charge' },
  TAKEN: { label: 'Prise en charge', badge: 'bg-indigo-100 text-indigo-700 dark:text-indigo-400', next: 'COMPLETED', nextLabel: 'Terminer' },
  COMPLETED: { label: 'Terminée', badge: 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300', next: null, nextLabel: null },
  REQUESTED: { label: 'Demandée', badge: 'bg-sky-100 text-sky-700 dark:text-sky-400', next: 'PROCESSING', nextLabel: 'Préparer l\'addition' },
  PROCESSING: { label: 'En cours', badge: 'bg-indigo-100 text-indigo-700 dark:text-indigo-400', next: 'PAID', nextLabel: 'Marquer payée' },
  PAID: { label: 'Payée', badge: 'bg-emerald-100 text-emerald-700 dark:text-emerald-400', next: null, nextLabel: null },
  CANCELLED: { label: 'Annulée', badge: 'bg-red-100 text-red-700 dark:text-red-400', next: null, nextLabel: null },
};

export const PERIOD_OPTIONS = [
  { value: 'today', label: 'Aujourd\'hui' },
  { value: 'yesterday', label: 'Hier' },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'custom', label: 'Période personnalisée' },
  { value: 'all', label: 'Tout' },
];

export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/** Cle de stockage du panier, propre à chaque table. */
export const cartKey = (tableToken) => `qrmenu.cart.${tableToken}`;
/** Commandes suivies par le client sur cette table. */
export const ordersKey = (tableToken) => `qrmenu.orders.${tableToken}`;
