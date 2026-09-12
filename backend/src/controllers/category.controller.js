const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { slugify } = require('../utils/helpers');

/** GET /api/categories */
const list = asyncHandler(async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { restaurantId: req.user.restaurantId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  });

  return success(
    res,
    categories.map((category) => ({ ...category, productCount: category._count.products })),
    'Categories recuperees'
  );
});

/** POST /api/categories */
const create = asyncHandler(async (req, res) => {
  const { name, icon, sortOrder, isActive } = req.body;
  const restaurantId = req.user.restaurantId;

  let slug = slugify(name);
  const existing = await prisma.category.findUnique({
    where: { restaurantId_slug: { restaurantId, slug } },
  });
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  const maxOrder = await prisma.category.aggregate({
    where: { restaurantId },
    _max: { sortOrder: true },
  });

  const category = await prisma.category.create({
    data: {
      restaurantId,
      name,
      slug,
      icon: icon || null,
      sortOrder: sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      isActive: isActive ?? true,
    },
  });

  return created(res, category, 'Categorie creee');
});

/** PUT /api/categories/:id */
const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const restaurantId = req.user.restaurantId;

  const category = await prisma.category.findFirst({ where: { id, restaurantId } });
  if (!category) throw ApiError.notFound('Categorie introuvable');

  const data = {};
  if (req.body.name !== undefined) {
    data.name = req.body.name;
    let slug = slugify(req.body.name);
    const clash = await prisma.category.findFirst({
      where: { restaurantId, slug, NOT: { id } },
    });
    if (clash) slug = `${slug}-${Date.now().toString(36)}`;
    data.slug = slug;
  }
  if (req.body.icon !== undefined) data.icon = req.body.icon;
  if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
  if (req.body.isActive !== undefined) data.isActive = req.body.isActive;

  const updated = await prisma.category.update({ where: { id }, data });
  return success(res, updated, 'Categorie mise a jour');
});

/** DELETE /api/categories/:id */
const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const category = await prisma.category.findFirst({
    where: { id, restaurantId: req.user.restaurantId },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw ApiError.notFound('Categorie introuvable');

  if (category._count.products > 0) {
    throw ApiError.conflict(
      `Impossible de supprimer : ${category._count.products} produit(s) utilisent cette categorie`
    );
  }

  await prisma.category.delete({ where: { id } });
  return success(res, null, 'Categorie supprimee');
});

/** PUT /api/categories/reorder */
const reorder = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const ids = req.body.items.map((item) => item.id);

  const owned = await prisma.category.count({ where: { id: { in: ids }, restaurantId } });
  if (owned !== ids.length) throw ApiError.forbidden('Certaines categories ne vous appartiennent pas');

  await prisma.$transaction(
    req.body.items.map((item) =>
      prisma.category.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })
    )
  );

  return success(res, null, 'Ordre des categories mis a jour');
});

module.exports = { list, create, update, remove, reorder };
