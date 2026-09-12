const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Export complet des donnees du restaurant.
 *
 * Les sauvegardes de volume de l'hebergeur sont reservees aux offres payantes :
 * cet export est le filet de securite qui fonctionne sur toutes les offres. Il
 * produit un instantane JSON restaurable, telechargeable par l'administrateur
 * ou recupere automatiquement par `npm run backup`.
 *
 * Les empreintes de mots de passe sont volontairement exclues : un export qui
 * circule par courriel ou dort dans un dossier synchronise ne doit jamais
 * contenir de quoi rejouer une authentification. Apres une restauration, les
 * mots de passe du personnel sont a redefinir.
 */

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

/** GET /api/backup - instantane complet (ADMIN) */
const exporter = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
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
  ]);

  const donnees = {
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
  };

  const comptes = Object.fromEntries(
    Object.entries(donnees).map(([nom, valeur]) => [nom, Array.isArray(valeur) ? valeur.length : valeur ? 1 : 0])
  );

  const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="chemoiresto-${horodatage}.json"`);

  return res.json(
    normaliser({
      metadonnees: {
        version: 1,
        genereLe: new Date(),
        restaurantId,
        motsDePasseExclus: true,
        comptes,
      },
      donnees,
    })
  );
});

module.exports = { exporter };
