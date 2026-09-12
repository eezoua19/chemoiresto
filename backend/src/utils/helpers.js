const crypto = require('crypto');

/** Jeton aleatoire non devinable (utilise pour les tables et le suivi client). */
function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Transforme un texte libre en slug URL. */
function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Convertit un Decimal Prisma (ou un nombre) en Number exploitable en JSON. */
function toNumber(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'object' && typeof value.toNumber === 'function'
    ? value.toNumber()
    : Number(value);
}

/**
 * Normalise une date (chaine "YYYY-MM-DD" ou Date) vers minuit UTC.
 * Les menus quotidiens sont stockes en colonne DATE : on évite ainsi
 * tout decalage de fuseau horaire entre le client et le serveur.
 */
function normalizeDate(input) {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(input));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** Date du jour (heure locale du serveur) normalisee a minuit UTC. */
function today() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Formate une date en "YYYY-MM-DD" sans decalage de fuseau. */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Bornes [debut, fin[ d'une journée locale, pour filtrer les commandes. */
function dayRange(dateInput) {
  const base = dateInput ? new Date(dateInput) : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** Arrondi monetaire a deux decimales. */
function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

module.exports = {
  randomToken,
  slugify,
  toNumber,
  normalizeDate,
  today,
  formatDate,
  dayRange,
  money,
};
