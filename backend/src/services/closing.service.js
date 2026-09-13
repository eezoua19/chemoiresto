const prisma = require('../config/prisma');
const { toNumber, formatDate, normalizeDate } = require('../utils/helpers');

/**
 * Cloture de journee : ce qu'a donne une journee, fige une fois pour toutes.
 *
 * Tout est recalculable depuis les commandes. On fige quand meme, pour trois
 * raisons : rouvrir le 3 mars ne doit pas relancer des agregations, les
 * chiffres d'un jour clos ne doivent plus bouger, et une journee sans service
 * doit exister au lieu de laisser un trou dans la liste.
 *
 * La Cote d'Ivoire vit a UTC toute l'annee : l'heure du serveur est l'heure
 * d'Abidjan, aucune conversion n'est necessaire.
 */

/** Bornes [debut, fin[ d'une journee, a partir d'une date normalisee. */
function bornes(date) {
  const debut = new Date(date);
  debut.setUTCHours(0, 0, 0, 0);
  const fin = new Date(debut);
  fin.setUTCDate(fin.getUTCDate() + 1);
  return { debut, fin };
}

const arrondi = (valeur) => Math.round(Number(valeur) || 0);

/** Calcule les chiffres d'une journee, sans rien ecrire. */
async function calculer(restaurantId, dateInput) {
  const date = normalizeDate(dateInput);
  if (!date) throw new Error('Date invalide');
  const { debut, fin } = bornes(date);

  const surLaJournee = { restaurantId, createdAt: { gte: debut, lt: fin } };
  // Le chiffre d'affaires ignore les commandes annulees ; leur nombre, lui,
  // est conserve a part : c'est une information de gestion, pas une recette.
  const valides = { ...surLaJournee, status: { not: 'CANCELLED' } };

  const [agregat, annulees, parType, lignes, commandes, passages, demandes] = await Promise.all([
    prisma.order.aggregate({ where: valides, _sum: { total: true }, _count: { _all: true } }),
    prisma.order.count({ where: { ...surLaJournee, status: 'CANCELLED' } }),
    prisma.order.groupBy({ by: ['type'], where: valides, _sum: { total: true } }),
    prisma.orderItem.groupBy({
      by: ['productName'],
      where: { order: valides },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 8,
    }),
    prisma.order.findMany({
      where: valides,
      select: { createdAt: true, serverId: true, total: true },
    }),
    prisma.subscriptionUsage.count({ where: surLaJournee }),
    prisma.serviceRequest.count({ where: surLaJournee }),
  ]);

  const revenue = arrondi(toNumber(agregat._sum.total));
  const ordersCount = agregat._count._all || 0;

  const parTypeMontant = (type) =>
    arrondi(toNumber(parType.find((ligne) => ligne.type === type)?._sum.total));

  // ---- Heure de pointe --------------------------------------------------
  const parHeure = new Map();
  for (const commande of commandes) {
    const heure = commande.createdAt.getUTCHours();
    parHeure.set(heure, (parHeure.get(heure) || 0) + 1);
  }
  let peakHour = null;
  let meilleur = 0;
  for (const [heure, nombre] of parHeure) {
    if (nombre > meilleur) {
      meilleur = nombre;
      peakHour = heure;
    }
  }

  // ---- Par serveuse -----------------------------------------------------
  const parServeuse = new Map();
  for (const commande of commandes) {
    if (!commande.serverId) continue;
    const entree = parServeuse.get(commande.serverId) || { orders: 0, revenue: 0 };
    entree.orders += 1;
    entree.revenue += toNumber(commande.total) || 0;
    parServeuse.set(commande.serverId, entree);
  }

  let servers = [];
  if (parServeuse.size) {
    const personnes = await prisma.user.findMany({
      where: { id: { in: [...parServeuse.keys()] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const parId = new Map(personnes.map((personne) => [personne.id, personne]));
    servers = [...parServeuse.entries()]
      .map(([id, valeurs]) => {
        const personne = parId.get(id);
        return {
          id,
          // Le nom est recopie : la cloture doit rester lisible meme si le
          // compte disparait plus tard.
          name: personne ? `${personne.firstName} ${personne.lastName}` : 'Compte supprimé',
          orders: valeurs.orders,
          revenue: arrondi(valeurs.revenue),
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }

  return {
    date: formatDate(date),
    revenue,
    ordersCount,
    cancelledCount: annulees,
    averageTicket: ordersCount ? Math.round(revenue / ordersCount) : 0,
    dineInRevenue: parTypeMontant('DINE_IN'),
    takeawayRevenue: parTypeMontant('TAKEAWAY'),
    topProducts: lignes.map((ligne) => ({
      name: ligne.productName,
      quantity: ligne._sum.quantity || 0,
      revenue: arrondi(toNumber(ligne._sum.lineTotal)),
    })),
    servers,
    peakHour,
    subscriptionUsages: passages,
    serviceRequests: demandes,
  };
}

/**
 * Calcule et fige la journee. Recloturer une journee la met a jour plutot que
 * d'echouer : un rattrapage ne doit jamais rester bloque sur un doublon.
 */
async function cloturer(restaurantId, dateInput) {
  const chiffres = await calculer(restaurantId, dateInput);
  const date = normalizeDate(dateInput);

  const donnees = {
    revenue: chiffres.revenue,
    ordersCount: chiffres.ordersCount,
    cancelledCount: chiffres.cancelledCount,
    averageTicket: chiffres.averageTicket,
    dineInRevenue: chiffres.dineInRevenue,
    takeawayRevenue: chiffres.takeawayRevenue,
    topProducts: JSON.stringify(chiffres.topProducts),
    servers: JSON.stringify(chiffres.servers),
    peakHour: chiffres.peakHour,
    subscriptionUsages: chiffres.subscriptionUsages,
    serviceRequests: chiffres.serviceRequests,
    closedAt: new Date(),
  };

  return prisma.dailyClosing.upsert({
    where: { restaurantId_date: { restaurantId, date } },
    create: { restaurantId, date, ...donnees },
    update: donnees,
  });
}

/**
 * Rattrape les journees non cloturees, jusqu'a hier.
 *
 * Sans cela, un serveur redemarre ou endormi laisserait des trous : la liste
 * sauterait du 3 au 7 mars sans que personne ne sache pourquoi.
 */
async function rattraper(restaurantId, { maxJours = 30 } = {}) {
  const hier = new Date();
  hier.setUTCHours(0, 0, 0, 0);
  hier.setUTCDate(hier.getUTCDate() - 1);

  const derniere = await prisma.dailyClosing.findFirst({
    where: { restaurantId },
    orderBy: { date: 'desc' },
    select: { date: true },
  });

  // Premiere mise en route : on ne remonte pas plus loin que la premiere
  // commande, sinon on fabriquerait des journees vides sans aucun interet.
  let curseur;
  if (derniere) {
    curseur = new Date(derniere.date);
    curseur.setUTCDate(curseur.getUTCDate() + 1);
  } else {
    const premiere = await prisma.order.findFirst({
      where: { restaurantId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    if (!premiere) return { clotures: 0 };
    curseur = normalizeDate(premiere.createdAt);
  }

  const faites = [];
  while (curseur <= hier && faites.length < maxJours) {
    // eslint-disable-next-line no-await-in-loop -- l'ordre chronologique compte
    await cloturer(restaurantId, curseur);
    faites.push(formatDate(curseur));
    curseur = new Date(curseur);
    curseur.setUTCDate(curseur.getUTCDate() + 1);
  }

  return { clotures: faites.length, jours: faites };
}

function serialiser(ligne) {
  if (!ligne) return null;
  const lire = (texte) => {
    if (!texte) return [];
    try {
      return JSON.parse(texte);
    } catch {
      return [];
    }
  };

  return {
    date: formatDate(ligne.date),
    revenue: toNumber(ligne.revenue),
    ordersCount: ligne.ordersCount,
    cancelledCount: ligne.cancelledCount,
    averageTicket: toNumber(ligne.averageTicket),
    dineInRevenue: toNumber(ligne.dineInRevenue),
    takeawayRevenue: toNumber(ligne.takeawayRevenue),
    topProducts: lire(ligne.topProducts),
    servers: lire(ligne.servers),
    peakHour: ligne.peakHour,
    subscriptionUsages: ligne.subscriptionUsages,
    serviceRequests: ligne.serviceRequests,
    closedAt: ligne.closedAt,
  };
}

module.exports = { calculer, cloturer, rattraper, serialiser };
