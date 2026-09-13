const prisma = require('../config/prisma');
const { randomToken, toNumber } = require('../utils/helpers');

// ---------------------------------------------------------------------------
// Formules
// ---------------------------------------------------------------------------

/**
 * Duree de chaque formule, en jours. Elle ne sert qu'a proposer une date
 * d'expiration : c'est toujours la date enregistree qui fait foi, pas la
 * formule. Un abonnement offert ou prolonge garde donc sa vraie date.
 */
const DUREES = {
  HEBDOMADAIRE: 7,
  MENSUEL: 30,
  TRIMESTRIEL: 90,
  ANNUEL: 365,
};

const LIBELLES_FORMULE = {
  HEBDOMADAIRE: 'Hebdomadaire',
  MENSUEL: 'Mensuel',
  TRIMESTRIEL: 'Trimestriel',
  ANNUEL: 'Annuel',
};

// ---------------------------------------------------------------------------
// Bornes de journee
// ---------------------------------------------------------------------------

/**
 * La Cote d'Ivoire est a UTC+0 toute l'annee : l'heure du serveur est l'heure
 * d'Abidjan, aucun decalage a corriger.
 *
 * Une date d'expiration est INCLUSE : un abonnement qui expire le 30 marche
 * jusqu'au 30 a 23 h 59. On range donc le debut au premier instant du jour et
 * la fin au dernier, une fois pour toutes a l'enregistrement, pour que toutes
 * les comparaisons qui suivent soient de simples "avant / apres".
 */
function debutDeJour(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function finDeJour(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function ajouterJours(date, jours) {
  const d = new Date(date);
  d.setDate(d.getDate() + jours);
  return d;
}

/** Date d'expiration proposee pour une formule commencant ce jour-la. */
function expirationProposee(debut, plan) {
  const jours = DUREES[plan] || DUREES.MENSUEL;
  // -1 : un abonnement mensuel commence le 1er expire le 30, pas le 31.
  return finDeJour(ajouterJours(debutDeJour(debut), jours - 1));
}

// ---------------------------------------------------------------------------
// Etat effectif
// ---------------------------------------------------------------------------

/**
 * Etat reellement affiche au personnel apres un scan.
 *
 * L'expiration n'est pas stockee : elle se deduit de la date du jour. Sinon il
 * faudrait une tache nocturne, et un abonnement resterait affiche "valide"
 * jusqu'a ce qu'elle tourne.
 *
 * PAS_COMMENCE n'etait pas demande, mais un abonnement paye pour le mois
 * prochain ne doit pas ouvrir droit aujourd'hui.
 */
function etatEffectif(subscription, maintenant = new Date()) {
  if (!subscription) return 'INTROUVABLE';
  if (subscription.status === 'INACTIVE') return 'INACTIF';
  if (subscription.status === 'SUSPENDED') return 'SUSPENDU';
  if (maintenant > new Date(subscription.endDate)) return 'EXPIRE';
  if (maintenant < new Date(subscription.startDate)) return 'PAS_COMMENCE';
  return 'VALIDE';
}

/** Ce que le personnel lit a l'ecran, en toutes lettres. */
const MESSAGES = {
  VALIDE: 'ABONNEMENT VALIDE',
  EXPIRE: 'ABONNEMENT EXPIRÉ',
  SUSPENDU: 'ABONNEMENT SUSPENDU',
  INACTIF: 'ABONNEMENT INACTIF',
  PAS_COMMENCE: 'ABONNEMENT PAS ENCORE COMMENCÉ',
  INTROUVABLE: 'ABONNEMENT INTROUVABLE',
};

/** Seul un abonnement valide autorise l'enregistrement d'un passage. */
function autoriseUtilisation(etat) {
  return etat === 'VALIDE';
}

/** Jours restants, negatif si deja expire. */
function joursRestants(subscription, maintenant = new Date()) {
  const fin = debutDeJour(subscription.endDate).getTime();
  const jour = debutDeJour(maintenant).getTime();
  return Math.round((fin - jour) / 86400000);
}

// ---------------------------------------------------------------------------
// Numero d'abonnement
// ---------------------------------------------------------------------------

/**
 * Genere un numero lisible et annonce a voix haute sans ambiguite :
 * ABO-2026-0007. Le compteur repart chaque annee, par restaurant.
 */
async function genererNumero(tx, restaurantId, annee) {
  const debut = new Date(annee, 0, 1, 0, 0, 0, 0);
  const fin = new Date(annee + 1, 0, 1, 0, 0, 0, 0);
  const total = await tx.subscription.count({
    where: { restaurantId, createdAt: { gte: debut, lt: fin } },
  });
  return (rang) => `ABO-${annee}-${String(total + rang).padStart(4, '0')}`;
}

/**
 * Cree l'abonnement, en reessayant si deux creations simultanees tombent sur
 * le meme numero.
 */
async function creerAbonnement(donnees) {
  const annee = new Date().getFullYear();

  return prisma.$transaction(async (tx) => {
    const numeroPour = await genererNumero(tx, donnees.restaurantId, annee);

    for (let essai = 1; essai <= 5; essai += 1) {
      try {
        return await tx.subscription.create({
          data: {
            ...donnees,
            number: numeroPour(essai),
            verifyToken: randomToken(16),
          },
          include: inclusion,
        });
      } catch (error) {
        if (error.code === 'P2002' && essai < 5) continue;
        throw error;
      }
    }
    return null;
  });
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

const inclusion = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { usages: true } },
};

const inclusionUsages = {
  ...inclusion,
  usages: {
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      order: { select: { id: true, orderNumber: true, total: true } },
    },
  },
};

function serialiserUtilisation(usage) {
  return {
    id: usage.id,
    type: usage.type,
    note: usage.note,
    createdAt: usage.createdAt,
    user: usage.user
      ? { id: usage.user.id, fullName: `${usage.user.firstName} ${usage.user.lastName}` }
      : null,
    order: usage.order
      ? {
          id: usage.order.id,
          orderNumber: usage.order.orderNumber,
          total: toNumber(usage.order.total),
        }
      : null,
  };
}

function serialiser(subscription, maintenant = new Date()) {
  if (!subscription) return null;
  const etat = etatEffectif(subscription, maintenant);

  return {
    id: subscription.id,
    number: subscription.number,
    verifyToken: subscription.verifyToken,
    firstName: subscription.firstName,
    lastName: subscription.lastName,
    fullName: `${subscription.firstName} ${subscription.lastName}`,
    phone: subscription.phone,
    plan: subscription.plan,
    planLabel: LIBELLES_FORMULE[subscription.plan] || subscription.plan,
    status: subscription.status,
    state: etat,
    stateLabel: MESSAGES[etat],
    isUsable: autoriseUtilisation(etat),
    daysLeft: joursRestants(subscription, maintenant),
    startDate: subscription.startDate,
    endDate: subscription.endDate,
    amount: subscription.amount === null || subscription.amount === undefined
      ? null
      : toNumber(subscription.amount),
    note: subscription.note,
    renewalCount: subscription.renewalCount,
    renewedAt: subscription.renewedAt,
    usageCount: subscription._count ? subscription._count.usages : undefined,
    createdAt: subscription.createdAt,
    createdBy: subscription.createdBy
      ? {
          id: subscription.createdBy.id,
          fullName: `${subscription.createdBy.firstName} ${subscription.createdBy.lastName}`,
        }
      : null,
    usages: subscription.usages ? subscription.usages.map(serialiserUtilisation) : undefined,
  };
}

module.exports = {
  DUREES,
  LIBELLES_FORMULE,
  MESSAGES,
  debutDeJour,
  finDeJour,
  ajouterJours,
  expirationProposee,
  etatEffectif,
  autoriseUtilisation,
  joursRestants,
  creerAbonnement,
  inclusion,
  inclusionUsages,
  serialiser,
  serialiserUtilisation,
};
