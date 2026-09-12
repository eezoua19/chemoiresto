const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { normalizeDate, formatDate, today, toNumber } = require('../utils/helpers');
const { productInclude } = require('../services/menu.service');
const { emitToStaff } = require('../sockets');

const menuInclude = {
  items: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { product: { include: productInclude } },
  },
};

function serializeMenu(menu) {
  if (!menu) return null;
  return {
    id: menu.id,
    date: formatDate(menu.date),
    title: menu.title,
    note: menu.note,
    isPublished: menu.isPublished,
    createdAt: menu.createdAt,
    updatedAt: menu.updatedAt,
    itemCount: menu.items ? menu.items.length : 0,
    items: (menu.items || []).map((item) => ({
      id: item.id,
      productId: item.productId,
      price: item.price === null || item.price === undefined ? null : toNumber(item.price),
      description: item.description,
      isAvailable: item.isAvailable,
      isDishOfDay: item.isDishOfDay,
      sortOrder: item.sortOrder,
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            description: item.product.description,
            image: item.product.image,
            basePrice: toNumber(item.product.basePrice),
            isAvailable: item.product.isAvailable,
            isActive: item.product.isActive,
            category: item.product.category,
          }
        : null,
    })),
  };
}

/** Vérifie que tous les produits appartiennent bien au restaurant. */
async function assertProductsOwned(restaurantId, items) {
  if (!items || !items.length) return;
  const ids = [...new Set(items.map((item) => item.productId))];
  const count = await prisma.product.count({ where: { id: { in: ids }, restaurantId } });
  if (count !== ids.length) throw ApiError.badRequest('Un ou plusieurs produits sont invalides');
}

/**
 * GET /api/menus?month=AAAA-MM  ou  ?from=&to=
 * Utilise par le calendrier des menus (pastilles verte / rouge).
 */
const list = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { month, from, to } = req.query;

  let start;
  let end;

  if (month) {
    const [year, monthNumber] = month.split('-').map(Number);
    start = new Date(Date.UTC(year, monthNumber - 1, 1));
    end = new Date(Date.UTC(year, monthNumber, 0)); // dernier jour du mois
  } else if (from && to) {
    start = normalizeDate(from);
    end = normalizeDate(to);
  } else {
    const now = new Date();
    start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
  }

  const menus = await prisma.dailyMenu.findMany({
    where: { restaurantId, date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
    include: { _count: { select: { items: true } } },
  });

  return success(
    res,
    {
      from: formatDate(start),
      to: formatDate(end),
      menus: menus.map((menu) => ({
        id: menu.id,
        date: formatDate(menu.date),
        title: menu.title,
        isPublished: menu.isPublished,
        itemCount: menu._count.items,
      })),
    },
    'Menus récupérés'
  );
});

/** GET /api/menus/date/:date - menu d'une date précise (null si aucun) */
const getByDate = asyncHandler(async (req, res) => {
  const date = normalizeDate(req.params.date);
  if (!date) throw ApiError.badRequest('Date invalide');

  const menu = await prisma.dailyMenu.findUnique({
    where: { restaurantId_date: { restaurantId: req.user.restaurantId, date } },
    include: menuInclude,
  });

  return success(
    res,
    { date: formatDate(date), menu: serializeMenu(menu) },
    menu ? 'Menu récupéré' : 'Aucun menu programme pour cette date'
  );
});

/** GET /api/menus/:id */
const detail = asyncHandler(async (req, res) => {
  const menu = await prisma.dailyMenu.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
    include: menuInclude,
  });
  if (!menu) throw ApiError.notFound('Menu introuvable');
  return success(res, serializeMenu(menu), 'Menu récupéré');
});

/** POST /api/menus */
const create = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { date, title, note, isPublished, items } = req.body;

  const normalized = normalizeDate(date);
  if (!normalized) throw ApiError.badRequest('Date invalide');

  const existing = await prisma.dailyMenu.findUnique({
    where: { restaurantId_date: { restaurantId, date: normalized } },
  });
  if (existing) {
    throw ApiError.conflict(
      `Un menu existe déjà pour le ${formatDate(normalized)}. Modifiez-le au lieu d'en créer un second.`
    );
  }

  await assertProductsOwned(restaurantId, items);

  // Deduplique les produits (un produit ne peut figurer qu'une fois par menu)
  const seen = new Set();
  const uniqueItems = (items || []).filter((item) => {
    if (seen.has(item.productId)) return false;
    seen.add(item.productId);
    return true;
  });

  const menu = await prisma.dailyMenu.create({
    data: {
      restaurantId,
      date: normalized,
      title: title || null,
      note: note || null,
      isPublished: isPublished ?? true,
      items: {
        create: uniqueItems.map((item, index) => ({
          productId: item.productId,
          price: item.price ?? null,
          description: item.description || null,
          isAvailable: item.isAvailable ?? true,
          isDishOfDay: item.isDishOfDay ?? false,
          sortOrder: item.sortOrder ?? index,
        })),
      },
    },
    include: menuInclude,
  });

  emitToStaff(restaurantId, 'menu_updated', { date: formatDate(normalized) });
  return created(res, serializeMenu(menu), `Menu du ${formatDate(normalized)} créé`);
});

/**
 * PUT /api/menus/:id
 * Si "items" est fourni, la liste remplace intégralement l'ancienne.
 */
const update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const restaurantId = req.user.restaurantId;

  const menu = await prisma.dailyMenu.findFirst({ where: { id, restaurantId } });
  if (!menu) throw ApiError.notFound('Menu introuvable');

  const { title, note, isPublished, items } = req.body;
  await assertProductsOwned(restaurantId, items);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.dailyMenu.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(isPublished !== undefined ? { isPublished } : {}),
      },
    });

    if (items !== undefined) {
      await tx.dailyMenuItem.deleteMany({ where: { dailyMenuId: id } });
      const seen = new Set();
      for (const [index, item] of items.entries()) {
        if (seen.has(item.productId)) continue;
        seen.add(item.productId);
        await tx.dailyMenuItem.create({
          data: {
            dailyMenuId: id,
            productId: item.productId,
            price: item.price ?? null,
            description: item.description || null,
            isAvailable: item.isAvailable ?? true,
            isDishOfDay: item.isDishOfDay ?? false,
            sortOrder: item.sortOrder ?? index,
          },
        });
      }
    }

    return tx.dailyMenu.findUnique({ where: { id }, include: menuInclude });
  });

  emitToStaff(restaurantId, 'menu_updated', { date: formatDate(updated.date) });
  return success(res, serializeMenu(updated), 'Menu mis à jour');
});

/** DELETE /api/menus/:id */
const remove = asyncHandler(async (req, res) => {
  const menu = await prisma.dailyMenu.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
  });
  if (!menu) throw ApiError.notFound('Menu introuvable');

  await prisma.dailyMenu.delete({ where: { id: menu.id } });
  emitToStaff(req.user.restaurantId, 'menu_updated', { date: formatDate(menu.date) });
  return success(res, null, 'Menu supprimé');
});

/**
 * POST /api/menus/:id/duplicate
 * Copie le menu source vers une autre date. Le menu source reste intact.
 */
const duplicate = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { targetDate, overwrite } = req.body;

  const source = await prisma.dailyMenu.findFirst({
    where: { id: req.params.id, restaurantId },
    include: { items: true },
  });
  if (!source) throw ApiError.notFound('Menu source introuvable');

  const target = normalizeDate(targetDate);
  if (!target) throw ApiError.badRequest('Date de destination invalide');
  if (formatDate(target) === formatDate(source.date)) {
    throw ApiError.badRequest('La date de destination doit être différente de la date source');
  }

  const existing = await prisma.dailyMenu.findUnique({
    where: { restaurantId_date: { restaurantId, date: target } },
  });

  if (existing && !overwrite) {
    throw ApiError.conflict(
      `Un menu existe déjà pour le ${formatDate(target)}. Cochez "remplacer" pour l'écraser.`
    );
  }

  const copy = await prisma.$transaction(async (tx) => {
    if (existing) await tx.dailyMenu.delete({ where: { id: existing.id } });

    return tx.dailyMenu.create({
      data: {
        restaurantId,
        date: target,
        title: source.title,
        note: source.note,
        isPublished: source.isPublished,
        items: {
          create: source.items.map((item) => ({
            productId: item.productId,
            price: item.price,
            description: item.description,
            isAvailable: item.isAvailable,
            isDishOfDay: item.isDishOfDay,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: menuInclude,
    });
  });

  emitToStaff(restaurantId, 'menu_updated', { date: formatDate(target) });
  return created(
    res,
    serializeMenu(copy),
    `Menu du ${formatDate(source.date)} copié vers le ${formatDate(target)}`
  );
});

/** GET /api/menus/today - raccourci pour le tableau de bord admin */
const getToday = asyncHandler(async (req, res) => {
  const date = today();
  const menu = await prisma.dailyMenu.findUnique({
    where: { restaurantId_date: { restaurantId: req.user.restaurantId, date } },
    include: menuInclude,
  });
  return success(
    res,
    { date: formatDate(date), menu: serializeMenu(menu) },
    menu ? 'Menu du jour récupéré' : 'Aucun menu programme pour aujourd\'hui'
  );
});

/**
 * POST /api/menus/today/products
 * Rend un produit immédiatement commandable par les clients.
 * Crée le menu du jour s'il n'existe pas encore : l'administrateur n'a donc
 * pas besoin de passer par le calendrier pour proposer un nouveau plat.
 */
const addProductToToday = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { productId } = req.body;
  const date = today();

  const product = await prisma.product.findFirst({ where: { id: productId, restaurantId } });
  if (!product) throw ApiError.notFound('Produit introuvable');
  if (!product.isActive) {
    throw ApiError.badRequest('Ce produit est archivé : réactivez-le avant de le mettre au menu');
  }

  const menu = await prisma.$transaction(async (tx) => {
    let dailyMenu = await tx.dailyMenu.findUnique({
      where: { restaurantId_date: { restaurantId, date } },
    });

    if (!dailyMenu) {
      dailyMenu = await tx.dailyMenu.create({
        data: { restaurantId, date, title: 'Menu du jour', isPublished: true },
      });
    }

    const existing = await tx.dailyMenuItem.findUnique({
      where: { dailyMenuId_productId: { dailyMenuId: dailyMenu.id, productId } },
    });

    if (!existing) {
      const last = await tx.dailyMenuItem.aggregate({
        where: { dailyMenuId: dailyMenu.id },
        _max: { sortOrder: true },
      });
      await tx.dailyMenuItem.create({
        data: {
          dailyMenuId: dailyMenu.id,
          productId,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
    }

    return tx.dailyMenu.findUnique({ where: { id: dailyMenu.id }, include: menuInclude });
  });

  emitToStaff(restaurantId, 'menu_updated', { date: formatDate(date) });
  return success(res, serializeMenu(menu), `"${product.name}" est au menu du jour`);
});

/** DELETE /api/menus/today/products/:productId - retire un plat du menu du jour */
const removeProductFromToday = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const productId = Number(req.params.productId);
  const date = today();

  const menu = await prisma.dailyMenu.findUnique({
    where: { restaurantId_date: { restaurantId, date } },
  });
  if (!menu) throw ApiError.notFound('Aucun menu programme pour aujourd\'hui');

  await prisma.dailyMenuItem.deleteMany({ where: { dailyMenuId: menu.id, productId } });

  const full = await prisma.dailyMenu.findUnique({ where: { id: menu.id }, include: menuInclude });
  emitToStaff(restaurantId, 'menu_updated', { date: formatDate(date) });
  return success(res, serializeMenu(full), 'Plat retire du menu du jour');
});

module.exports = {
  list,
  getByDate,
  detail,
  create,
  update,
  remove,
  duplicate,
  getToday,
  addProductToToday,
  removeProductFromToday,
};
