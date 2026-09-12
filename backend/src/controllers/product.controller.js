const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { toNumber } = require('../utils/helpers');
const { removeProductImage } = require('../middleware/upload');
const { emitToStaff } = require('../sockets');

const include = {
  category: { select: { id: true, name: true, slug: true, icon: true } },
  options: {
    orderBy: { sortOrder: 'asc' },
    include: { values: { orderBy: { sortOrder: 'asc' } } },
  },
};

function serialize(product) {
  return {
    ...product,
    basePrice: toNumber(product.basePrice),
    options: (product.options || []).map((option) => ({
      ...option,
      values: option.values.map((value) => ({ ...value, priceDelta: toNumber(value.priceDelta) })),
    })),
  };
}

/** Remplace intégralement les groupes d'options d'un produit. */
async function replaceOptions(tx, productId, options) {
  await tx.productOption.deleteMany({ where: { productId } });
  for (const [index, option] of options.entries()) {
    await tx.productOption.create({
      data: {
        productId,
        name: option.name,
        type: option.type,
        isRequired: option.isRequired ?? false,
        sortOrder: option.sortOrder ?? index,
        values: {
          create: (option.values || []).map((value, vIndex) => ({
            name: value.name,
            priceDelta: value.priceDelta ?? 0,
            isAvailable: value.isAvailable ?? true,
            sortOrder: value.sortOrder ?? vIndex,
          })),
        },
      },
    });
  }
}

/** GET /api/products */
const list = asyncHandler(async (req, res) => {
  const { categoryId, search, available, active } = req.query;

  const products = await prisma.product.findMany({
    where: {
      restaurantId: req.user.restaurantId,
      ...(categoryId ? { categoryId: Number(categoryId) } : {}),
      ...(available !== undefined ? { isAvailable: available === 'true' } : {}),
      ...(active !== undefined ? { isActive: active === 'true' } : {}),
      ...(search ? { name: { contains: String(search) } } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include,
  });

  return success(res, products.map(serialize), 'Produits récupérés');
});

/** GET /api/products/:id */
const detail = asyncHandler(async (req, res) => {
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
    include,
  });
  if (!product) throw ApiError.notFound('Produit introuvable');
  return success(res, serialize(product), 'Produit récupéré');
});

/** POST /api/products (multipart : champ "image" optionnel) */
const create = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { name, description, basePrice, categoryId, isAvailable, isActive, sortOrder, options } = req.body;

  if (categoryId) {
    const category = await prisma.category.findFirst({ where: { id: categoryId, restaurantId } });
    if (!category) throw ApiError.badRequest('Catégorie invalide');
  }

  const product = await prisma.$transaction(async (tx) => {
    const createdProduct = await tx.product.create({
      data: {
        restaurantId,
        categoryId: categoryId || null,
        name,
        description: description || null,
        basePrice,
        image: req.file ? `/uploads/products/${req.file.filename}` : null,
        isAvailable: isAvailable ?? true,
        isActive: isActive ?? true,
        sortOrder: sortOrder ?? 0,
      },
    });

    if (options && options.length) await replaceOptions(tx, createdProduct.id, options);

    return tx.product.findUnique({ where: { id: createdProduct.id }, include });
  });

  return created(res, serialize(product), 'Produit créé');
});

/** PUT /api/products/:id */
const update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const restaurantId = req.user.restaurantId;

  const existing = await prisma.product.findFirst({ where: { id, restaurantId } });
  if (!existing) throw ApiError.notFound('Produit introuvable');

  const body = req.body;
  const data = {};

  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.basePrice !== undefined) data.basePrice = body.basePrice;
  if (body.isAvailable !== undefined) data.isAvailable = body.isAvailable;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

  if (body.categoryId !== undefined) {
    if (body.categoryId === null) {
      data.categoryId = null;
    } else {
      const category = await prisma.category.findFirst({
        where: { id: body.categoryId, restaurantId },
      });
      if (!category) throw ApiError.badRequest('Catégorie invalide');
      data.categoryId = body.categoryId;
    }
  }

  let imageToDelete = null;
  if (req.file) {
    data.image = `/uploads/products/${req.file.filename}`;
    imageToDelete = existing.image;
  } else if (body.removeImage) {
    data.image = null;
    imageToDelete = existing.image;
  }

  const product = await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data });
    if (body.options !== undefined) await replaceOptions(tx, id, body.options);
    return tx.product.findUnique({ where: { id }, include });
  });

  if (imageToDelete) removeProductImage(imageToDelete);

  return success(res, serialize(product), 'Produit mis à jour');
});

/**
 * DELETE /api/products/:id
 * Un produit déjà commande est désactivé plutot que supprime afin de
 * préserver l'historique des commandes.
 */
const remove = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const product = await prisma.product.findFirst({
    where: { id, restaurantId: req.user.restaurantId },
    include: { _count: { select: { orderItems: true, dailyMenuItems: true } } },
  });
  if (!product) throw ApiError.notFound('Produit introuvable');

  if (product._count.orderItems > 0) {
    const archived = await prisma.product.update({
      where: { id },
      data: { isActive: false, isAvailable: false },
      include,
    });
    return success(
      res,
      serialize(archived),
      'Ce produit figure dans des commandes passées : il a été archivé (désactivé) au lieu d\'être supprimé'
    );
  }

  if (product.image) removeProductImage(product.image);
  await prisma.product.delete({ where: { id } });
  return success(res, null, 'Produit supprimé');
});

/** PATCH /api/products/:id/availability */
const toggleAvailability = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const product = await prisma.product.findFirst({
    where: { id, restaurantId: req.user.restaurantId },
  });
  if (!product) throw ApiError.notFound('Produit introuvable');

  const updated = await prisma.product.update({
    where: { id },
    data: { isAvailable: !product.isAvailable },
    include,
  });

  // Une rupture déclarée en salle doit apparaitre sur tous les appareils du
  // personnel : la serveuse d'a côté ne doit pas continuer a proposer le plat.
  emitToStaff(req.user.restaurantId, 'product_availability', {
    id: updated.id,
    name: updated.name,
    isAvailable: updated.isAvailable,
  });

  return success(
    res,
    serialize(updated),
    updated.isAvailable ? 'Produit rendu disponible' : 'Produit rendu indisponible'
  );
});

module.exports = { list, detail, create, update, remove, toggleAvailability };
