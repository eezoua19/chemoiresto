/**
 * Presentation des abonnements.
 *
 * L'etat n'est pas un champ de la base : le serveur le calcule a partir du
 * statut décidé par l'administration ET de la date du jour. Le frontend ne
 * recalcule rien, il se contente d'habiller ce que le serveur a tranché.
 */

export const ETATS = {
  VALIDE: {
    label: 'ABONNEMENT VALIDE',
    court: 'Valide',
    badge: 'bg-emerald-100 text-emerald-800 dark:text-emerald-300',
    bloc: 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-900',
    accent: 'text-emerald-700 dark:text-emerald-400',
  },
  EXPIRE: {
    label: 'ABONNEMENT EXPIRÉ',
    court: 'Expiré',
    badge: 'bg-red-100 text-red-800 dark:text-red-300',
    bloc: 'border-red-300 bg-red-50 dark:bg-red-900/20 text-red-900',
    accent: 'text-red-700 dark:text-red-400',
  },
  SUSPENDU: {
    label: 'ABONNEMENT SUSPENDU',
    court: 'Suspendu',
    badge: 'bg-amber-100 text-amber-900 dark:text-amber-300',
    bloc: 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-300',
    accent: 'text-amber-700 dark:text-amber-400',
  },
  INACTIF: {
    label: 'ABONNEMENT INACTIF',
    court: 'Inactif',
    badge: 'bg-ink-200 dark:bg-ink-700 text-ink-700 dark:text-ink-200',
    bloc: 'border-ink-300 dark:border-ink-600 bg-ink-100 dark:bg-ink-800 text-ink-800 dark:text-ink-100',
    accent: 'text-ink-600 dark:text-ink-300',
  },
  PAS_COMMENCE: {
    label: 'ABONNEMENT PAS ENCORE COMMENCÉ',
    court: 'À venir',
    badge: 'bg-sky-100 text-sky-800 dark:text-sky-300',
    bloc: 'border-sky-300 bg-sky-50 dark:bg-sky-900/20 text-sky-900',
    accent: 'text-sky-700 dark:text-sky-400',
  },
  INTROUVABLE: {
    label: 'ABONNEMENT INTROUVABLE',
    court: 'Introuvable',
    badge: 'bg-ink-200 dark:bg-ink-700 text-ink-700 dark:text-ink-200',
    bloc: 'border-ink-300 dark:border-ink-600 bg-ink-100 dark:bg-ink-800 text-ink-800 dark:text-ink-100',
    accent: 'text-ink-600 dark:text-ink-300',
  },
};

export const FORMULES = [
  { value: 'HEBDOMADAIRE', label: 'Hebdomadaire', jours: 7 },
  { value: 'MENSUEL', label: 'Mensuel', jours: 30 },
  { value: 'TRIMESTRIEL', label: 'Trimestriel', jours: 90 },
  { value: 'ANNUEL', label: 'Annuel', jours: 365 },
];

export const TYPES_UTILISATION = [
  { value: 'REPAS', label: 'Repas' },
  { value: 'BOISSON', label: 'Boisson' },
  { value: 'AUTRE', label: 'Autre' },
];

export function etatDe(abonnement) {
  return ETATS[abonnement?.state] || ETATS.INTROUVABLE;
}

/** "Expire dans 3 jours" / "Expiré depuis 5 jours" / "Expire aujourd'hui". */
export function echeance(abonnement) {
  if (!abonnement) return '';
  const jours = abonnement.daysLeft;
  if (jours === 0) return "Expire aujourd'hui";
  if (jours > 0) return `Expire dans ${jours} jour${jours > 1 ? 's' : ''}`;
  const passes = Math.abs(jours);
  return `Expiré depuis ${passes} jour${passes > 1 ? 's' : ''}`;
}

/** Date du jour au format attendu par un champ <input type="date">. */
export function aujourdhuiISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date d'expiration proposée, alignée sur le calcul du serveur. */
export function expirationProposee(debutISO, formule) {
  const jours = FORMULES.find((f) => f.value === formule)?.jours || 30;
  const d = new Date(`${debutISO}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  // -1 : un mensuel commencé le 1er expire le 30, pas le 31.
  d.setDate(d.getDate() + jours - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Extrait le jeton d'un ticket a partir de ce qui a ete scanne ou colle.
 *
 * Le QR contient une adresse complete, mais on accepte aussi un jeton seul :
 * au comptoir, personne ne doit se demander quelle forme est la bonne.
 * Tout le reste renvoie null - un QR de table, par exemple, n'est pas un ticket.
 */
export function jetonDuCode(texte) {
  if (!texte) return null;
  const surAbonnement = String(texte).match(/\/abonnement\/([a-f0-9]{32})/i);
  if (surAbonnement) return surAbonnement[1].toLowerCase();
  const nu = String(texte).trim();
  if (/^[a-f0-9]{32}$/i.test(nu)) return nu.toLowerCase();
  return null;
}
