const prisma = require('../config/prisma');
const { toNumber, normalizeDate, today, formatDate } = require('../utils/helpers');

/** Champs de produit nécessaires à l'affichage du menu client. */
const productInclude = {
  category: { select: { id: true, name: true, slug: true, icon: true, sortOrder: true } },
  options: {
    orderBy: { sortOrder: 'asc' },
    include: { values: { orderBy: { sortOrder: 'asc' } } },
  },
};

/**
 * Recupere le menu d'une date donnee pour un restaurant.
 * Retourne null si aucun menu n'est programme pour cette date.
 */
async function getMenuByDate(restaurantId, dateInput) {
  const date = normalizeDate(dateInput) || today();

  return prisma.dailyMenu.findUnique({
    where: { restaurantId_date: { restaurantId, date } },
    include: {
      items: {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: { product: { include: productInclude } },
      },
    },
  });
}

/**
 * Met le menu en forme pour le client.
 * Le prix affiche est le prix du jour s'il existe, sinon le prix de base.
 * Un produit désactivé globalement n'apparaît pas du tout.
 */
function serializeMenuForClient(menu, restaurant) {
  if (!menu) return null;

  const items = menu.items
    .filter((item) => item.product && item.product.isActive)
    .map((item) => {
      const price = item.price !== null && item.price !== undefined
        ? toNumber(item.price)
        : toNumber(item.product.basePrice);

      return {
        id: item.id,
        productId: item.product.id,
        name: item.product.name,
        description: item.description || item.product.description,
        image: item.product.image,
        price,
        basePrice: toNumber(item.product.basePrice),
        hasSpecialPrice: item.price !== null && item.price !== undefined,
        isAvailable: item.isAvailable && item.product.isAvailable,
        isDishOfDay: item.isDishOfDay,
        sortOrder: item.sortOrder,
        category: item.product.category
          ? {
              id: item.product.category.id,
              name: item.product.category.name,
              slug: item.product.category.slug,
              icon: item.product.category.icon,
              sortOrder: item.product.category.sortOrder,
            }
          : null,
        options: item.product.options.map((option) => ({
          id: option.id,
          name: option.name,
          type: option.type,
          isRequired: option.isRequired,
          values: option.values
            .filter((value) => value.isAvailable)
            .map((value) => ({
              id: value.id,
              name: value.name,
              priceDelta: toNumber(value.priceDelta),
            })),
        })),
      };
    });

  // Catégories reellement presentes dans le menu du jour
  const categoryMap = new Map();
  for (const item of items) {
    if (item.category && !categoryMap.has(item.category.id)) {
      categoryMap.set(item.category.id, item.category);
    }
  }
  const categories = [...categoryMap.values()].sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    id: menu.id,
    date: formatDate(menu.date),
    title: menu.title,
    note: menu.note,
    isPublished: menu.isPublished,
    currency: restaurant ? restaurant.currency : 'FCFA',
    categories,
    items,
  };
}

/**
 * Resout le prix unitaire officiel d'un produit pour une date donnee.
 * Utilise par le calcul de commande : le serveur ne fait jamais confiance
 * au prix envoye par le frontend.
 */
function resolveUnitPrice(menuItem, product) {
  if (menuItem && menuItem.price !== null && menuItem.price !== undefined) {
    return toNumber(menuItem.price);
  }
  return toNumber(product.basePrice);
}

module.exports = { getMenuByDate, serializeMenuForClient, resolveUnitPrice, productInclude };
