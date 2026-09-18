const ApiError = require('../utils/apiError');
const { toNumber, money } = require('../utils/helpers');

/**
 * Valide un code promo et calcule la remise associee.
 *
 * `client` est soit `prisma`, soit `tx` (transaction en cours) : la meme
 * fonction sert a l'apercu public (avant commande) et a la validation finale
 * dans la transaction de creation de commande.
 */
async function validateCode(client, restaurantId, code, subtotal) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) {
    throw ApiError.badRequest('Code promo invalide');
  }

  const promoCode = await client.promoCode.findFirst({
    where: { restaurantId, code: normalized, isActive: true },
  });

  if (!promoCode) {
    throw ApiError.badRequest('Code promo invalide');
  }

  if (promoCode.expiresAt && promoCode.expiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest('Ce code promo a expiré');
  }

  if (promoCode.maxUses !== null && promoCode.usesCount >= promoCode.maxUses) {
    throw ApiError.badRequest('Ce code promo a atteint sa limite d\'utilisation');
  }

  const minOrderAmount = toNumber(promoCode.minOrderAmount);
  if (minOrderAmount !== null && subtotal < minOrderAmount) {
    throw ApiError.badRequest(`Montant minimum de ${minOrderAmount} FCFA requis pour ce code`);
  }

  const value = toNumber(promoCode.value);
  const discountAmount =
    promoCode.type === 'PERCENT'
      ? money((subtotal * value) / 100)
      : Math.min(money(value), subtotal);

  return { promoCode, discountAmount };
}

/**
 * Consomme un code promo a l'interieur d'une transaction de commande.
 *
 * Re-lit le compteur depuis la base (et non depuis la valeur validee plus
 * tot dans le meme appel) pour rester correct si deux commandes concurrentes
 * visent le meme code : la seconde a rater le plafond doit echouer ici,
 * meme si elle est passee par validateCode avant que la premiere n'incremente.
 */
async function redeem(tx, promoCodeId) {
  const fresh = await tx.promoCode.findUnique({ where: { id: promoCodeId } });
  if (!fresh) {
    throw ApiError.badRequest('Code promo invalide');
  }
  if (fresh.maxUses !== null && fresh.usesCount >= fresh.maxUses) {
    throw ApiError.badRequest('Ce code promo a atteint sa limite d\'utilisation');
  }

  return tx.promoCode.update({
    where: { id: promoCodeId },
    data: { usesCount: { increment: 1 } },
  });
}

module.exports = { validateCode, redeem };
