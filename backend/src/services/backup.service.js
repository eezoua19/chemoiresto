const prisma = require('../config/prisma');

/**
 * Instantanes des donnees du restaurant.
 *
 * Ce que cela protege : l'erreur humaine. Un plat efface par megarde, une
 * carte videe, un menu ecrase - on retrouve l'etat d'hier.
 *
 * Ce que cela ne protege pas : la perte de la base elle-meme, puisque les
 * instantanes y vivent. C'est pour cela que le telechargement existe et qu'il
 * est mis en avant dans l'interface : la seule vraie copie est celle qui dort
 * ailleurs.
 *
 * Les empreintes de mots de passe sont exclues : un export qui circule ne doit
 * jamais contenir de quoi rejouer une authentification.
 */

/** Nombre d'instantanes conserves. Au-dela, les plus vieux sont effaces. */
const CONSERVES = 14;

/**
 * Au-dela de cette taille on n'ecrit plus le contenu en base : un INSERT
 * gigantesque casse sur la limite de paquet MySQL et ferait echouer toute la
 * sauvegarde. On garde alors la ligne, avec la raison, pour que le silence ne
 * passe pas inapercu.
 */
const TAILLE_MAX = 12 * 1024 * 1024;

/** Les Decimal de Prisma et les BigInt ne sont pas serialisables tels quels. */
function normaliser(valeur) {
  if (valeur === null || valeur === undefined) return valeur;
  if (typeof valeur === 'bigint') return Number(valeur);
  if (valeur instanceof Date) return valeur.toISOString();
  if (Array.isArray(valeur)) return valeur.map(normaliser);
  if (typeof valeur === 'object') {
    // Decimal de Prisma : expose une conversion en chaine fidele.
    if (typeof valeur.toFixed === 'function' && typeof valeur.toNumber === 'function') {
      return valeur.toString();
    }
    return Object.fromEntries(Object.entries(valeur).map(([cle, val]) => [cle, normaliser(val)]));
  }
  return valeur;
}

/** Toutes les donnees du restaurant, mots de passe exclus. */
async function collecter(restaurantId) {
  const parRestaurant = { where: { restaurantId } };

  const [
    restaurant,
    users,
    categories,
    products,
    productOptions,
    productOptionValues,
    tables,
    qrCodes,
    dailyMenus,
    dailyMenuItems,
    customers,
    orders,
    orderItems,
    orderItemOptions,
    orderStatusHistory,
    serviceRequests,
    subscriptions,
    subscriptionUsages,
    auditLogs,
    closings,
  ] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId } }),
    prisma.user.findMany({
      ...parRestaurant,
      // Tout sauf le mot de passe.
      select: {
        id: true,
        restaurantId: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.category.findMany(parRestaurant),
    prisma.product.findMany(parRestaurant),
    prisma.productOption.findMany({ where: { product: { restaurantId } } }),
    prisma.productOptionValue.findMany({ where: { option: { product: { restaurantId } } } }),
    prisma.restaurantTable.findMany(parRestaurant),
    prisma.qRCode.findMany({ where: { table: { restaurantId } } }),
    prisma.dailyMenu.findMany(parRestaurant),
    prisma.dailyMenuItem.findMany({ where: { dailyMenu: { restaurantId } } }),
    prisma.customer.findMany(parRestaurant),
    prisma.order.findMany(parRestaurant),
    prisma.orderItem.findMany({ where: { order: { restaurantId } } }),
    prisma.orderItemOption.findMany({ where: { orderItem: { order: { restaurantId } } } }),
    prisma.orderStatusHistory.findMany({ where: { order: { restaurantId } } }),
    prisma.serviceRequest.findMany(parRestaurant),
    prisma.subscription.findMany(parRestaurant),
    prisma.subscriptionUsage.findMany(parRestaurant),
    prisma.auditLog.findMany(parRestaurant),
    prisma.dailyClosing.findMany(parRestaurant),
  ]);

  return {
    restaurant,
    users,
    categories,
    products,
    productOptions,
    productOptionValues,
    tables,
    qrCodes,
    dailyMenus,
    dailyMenuItems,
    customers,
    orders,
    orderItems,
    orderItemOptions,
    orderStatusHistory,
    serviceRequests,
    subscriptions,
    subscriptionUsages,
    auditLogs,
    closings,
  };
}

/** L'objet complet, metadonnees comprises, pret a etre ecrit ou telecharge. */
async function construireInstantane(restaurantId) {
  const donnees = await collecter(restaurantId);

  const comptes = Object.fromEntries(
    Object.entries(donnees).map(([nom, valeur]) => [
      nom,
      Array.isArray(valeur) ? valeur.length : valeur ? 1 : 0,
    ])
  );

  return normaliser({
    metadonnees: {
      version: 2,
      genereLe: new Date(),
      restaurantId,
      motsDePasseExclus: true,
      comptes,
    },
    donnees,
  });
}

/**
 * Prend un instantane et le range en base, puis fait la rotation.
 *
 * Ne leve jamais : appelee par le planificateur en pleine nuit, une exception
 * non rattrapee arreterait le processus. L'echec est renvoye, pas jete.
 */
async function enregistrerInstantane(restaurantId, trigger = 'AUTOMATIQUE') {
  try {
    const instantane = await construireInstantane(restaurantId);
    const texte = JSON.stringify(instantane);
    const taille = Buffer.byteLength(texte, 'utf8');
    const trop = taille > TAILLE_MAX;

    const ligne = await prisma.backupSnapshot.create({
      data: {
        restaurantId,
        trigger,
        sizeBytes: taille,
        counts: JSON.stringify(instantane.metadonnees.comptes),
        content: trop ? null : texte,
        note: trop
          ? 'Instantané trop volumineux pour être conservé en base. Téléchargez la sauvegarde manuellement.'
          : null,
      },
      select: { id: true, createdAt: true, sizeBytes: true, note: true },
    });

    // Rotation : on ne garde que les plus recents.
    const anciens = await prisma.backupSnapshot.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      skip: CONSERVES,
      select: { id: true },
    });
    if (anciens.length) {
      await prisma.backupSnapshot.deleteMany({
        where: { id: { in: anciens.map((ancien) => ancien.id) } },
      });
    }

    return { ok: true, snapshot: ligne, supprimes: anciens.length };
  } catch (error) {
    console.error('[SAUVEGARDE] echec :', error.message);
    return { ok: false, erreur: error.message };
  }
}

function serialiser(ligne) {
  let comptes = null;
  try {
    comptes = ligne.counts ? JSON.parse(ligne.counts) : null;
  } catch {
    comptes = null;
  }

  return {
    id: ligne.id,
    trigger: ligne.trigger,
    sizeBytes: ligne.sizeBytes,
    counts: comptes,
    note: ligne.note,
    // La liste ne charge pas le contenu (plusieurs Mo) : on se rabat alors sur
    // la note, qui n'est renseignee que lorsque le contenu n'a pas ete garde.
    downloadable: 'content' in ligne ? ligne.content !== null : !ligne.note,
    createdAt: ligne.createdAt,
  };
}

module.exports = {
  CONSERVES,
  construireInstantane,
  enregistrerInstantane,
  normaliser,
  serialiser,
};
