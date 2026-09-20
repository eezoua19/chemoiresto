const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { toNumber } = require('../utils/helpers');

function statusOf(promoCode) {
  if (!promoCode.isActive) return 'INACTIVE';
  if (promoCode.expiresAt && promoCode.expiresAt.getTime() < Date.now()) return 'EXPIRED';
  if (promoCode.maxUses !== null && promoCode.usesCount >= promoCode.maxUses) return 'EXHAUSTED';
  return 'ACTIVE';
}

function serialize(promoCode) {
  return {
    id: promoCode.id,
    code: promoCode.code,
    type: promoCode.type,
    value: toNumber(promoCode.value),
    minOrderAmount: toNumber(promoCode.minOrderAmount),
    maxUses: promoCode.maxUses,
    usesCount: promoCode.usesCount,
    expiresAt: promoCode.expiresAt,
    isActive: promoCode.isActive,
    status: statusOf(promoCode),
    createdAt: promoCode.createdAt,
    updatedAt: promoCode.updatedAt,
  };
}

/** GET /api/promo-codes (ADMIN) */
const list = asyncHandler(async (req, res) => {
  const promoCodes = await prisma.promoCode.findMany({
    where: { restaurantId: req.user.restaurantId },
    orderBy: { createdAt: 'desc' },
  });
  return success(res, promoCodes.map(serialize), 'Codes promo récupérés');
});

/** POST /api/promo-codes (ADMIN) */
const create = asyncHandler(async (req, res) => {
  try {
    const promoCode = await prisma.promoCode.create({
      data: { ...req.body, restaurantId: req.user.restaurantId },
    });
    return created(res, serialize(promoCode), 'Code promo créé');
  } catch (error) {
    if (error.code === 'P2002') {
      throw ApiError.conflict('Ce code promo existe déjà pour ce restaurant');
    }
    throw error;
  }
});

/** PUT /api/promo-codes/:id (ADMIN) */
const update = asyncHandler(async (req, res) => {
  const existing = await prisma.promoCode.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
  });
  if (!existing) throw ApiError.notFound('Code promo introuvable');

  // Le schema Zod ne valide que les champs presents dans CE corps de requete :
  // une mise a jour partielle qui ne renvoie que `value` (sans `type`) passerait
  // son propre refine. On revalide donc ici l'etat final, fusion de l'existant
  // et du corps recu, avant d'ecrire.
  const nextType = req.body.type ?? existing.type;
  const nextValue = req.body.value ?? toNumber(existing.value);
  if (nextType === 'PERCENT' && nextValue > 100) {
    throw ApiError.badRequest('Un pourcentage ne peut pas dépasser 100');
  }

  try {
    const promoCode = await prisma.promoCode.update({
      where: { id: existing.id },
      data: req.body,
    });
    return success(res, serialize(promoCode), 'Code promo modifié');
  } catch (error) {
    if (error.code === 'P2002') {
      throw ApiError.conflict('Ce code promo existe déjà pour ce restaurant');
    }
    throw error;
  }
});

/**
 * DELETE /api/promo-codes/:id (ADMIN)
 * Un code deja utilise est desactive plutot que supprime, afin de garder
 * intacte la reference depuis les commandes passees (Order.promoCodeId).
 */
const remove = asyncHandler(async (req, res) => {
  const existing = await prisma.promoCode.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
  });
  if (!existing) throw ApiError.notFound('Code promo introuvable');

  if (existing.usesCount > 0) {
    req.journal = { label: `Code promo désactivé (déjà utilisé) : ${existing.code}` };
    const archived = await prisma.promoCode.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
    return success(
      res,
      serialize(archived),
      'Ce code a déjà été utilisé : il a été désactivé au lieu d\'être supprimé'
    );
  }

  req.journal = { label: `Code promo supprimé : ${existing.code}` };
  await prisma.promoCode.delete({ where: { id: existing.id } });
  return success(res, null, 'Code promo supprimé');
});

module.exports = { list, create, update, remove, serialize };
