/** Formate un montant : 9000 -> "9 000 FCFA" */
export function formatMoney(amount, currency = 'FCFA') {
  const value = Number(amount || 0);
  const formatted = value
    .toFixed(value % 1 === 0 ? 0 : 2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} ${currency}`;
}

/** "2026-09-11" -> "vendredi 11 septembre 2026" */
export function formatLongDate(dateString) {
  const date = toDate(dateString);
  if (!date) return '';
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "2026-09-11" -> "11/09/2026" */
export function formatShortDate(dateString) {
  const date = toDate(dateString);
  if (!date) return '';
  return date.toLocaleDateString('fr-FR');
}

/** Date + heure : "11/09/2026 a 21:34" */
export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return `${date.toLocaleDateString('fr-FR')} a ${date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** Heure seule : "21:34" */
export function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Temps ecoule en langage naturel : "il y a 4 min" */
export function timeAgo(value) {
  if (!value) return '';
  const diff = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

/** Chaine "AAAA-MM-JJ" à partir d'un objet Date (sans decalage de fuseau). */
export function toDateString(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/** Date du jour au format "AAAA-MM-JJ". */
export function todayString() {
  return toDateString(new Date());
}

function toDate(dateString) {
  if (!dateString) return null;
  if (dateString instanceof Date) return dateString;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(dateString);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Initiales d'un nom : "Marie Kouassi" -> "MK" */
export function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}
