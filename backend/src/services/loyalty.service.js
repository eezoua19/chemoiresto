const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');

/**
 * Attribue un point de fidélité pour une commande servie.
 *
 * Un point par commande SERVED, jamais plus : compter les articles ou le
 * montant récompenserait les grosses tables au détriment des habitués qui
 * commandent peu à chaque passage. Le seuil de récompense se franchit
 * exactement tous les `loyaltyRewardThreshold` points.
 */
async function awardForOrder(order, restaurant) {
  if (!restaurant.loyaltyEnabled) return null;
  const phone = order.customerPhone ? order.customerPhone.trim() : '';
  if (!phone) return null;

  const threshold = restaurant.loyaltyRewardThreshold || 10;

  return prisma.$transaction(async (tx) => {
    const account = await tx.loyaltyAccount.upsert({
      where: { restaurantId_phone: { restaurantId: restaurant.id, phone } },
      create: {
        restaurantId: restaurant.id,
        phone,
        name: order.customerName || null,
      },
      update: order.customerName ? { name: order.customerName } : {},
    });

    const points = account.points + 1;
    const rewardGranted = points % threshold === 0;

    const updated = await tx.loyaltyAccount.update({
      where: { id: account.id },
      data: {
        points,
        ...(rewardGranted ? { rewardsAvailable: { increment: 1 } } : {}),
      },
    });

    await tx.loyaltyTransaction.create({
      data: {
        restaurantId: restaurant.id,
        loyaltyAccountId: account.id,
        orderId: order.id,
        type: 'EARN',
        points: 1,
      },
    });

    if (rewardGranted) {
      await tx.loyaltyTransaction.create({
        data: {
          restaurantId: restaurant.id,
          loyaltyAccountId: account.id,
          orderId: order.id,
          type: 'REWARD_GRANTED',
          points: 0,
          note: `Récompense débloquée à ${points} points`,
        },
      });
    }

    return updated;
  });
}

/** Le compte du client rattaché à ce numéro, ou null s'il n'existe pas encore. */
async function findAccountByPhone(restaurantId, phone) {
  if (!phone) return null;
  return prisma.loyaltyAccount.findUnique({
    where: { restaurantId_phone: { restaurantId, phone: phone.trim() } },
  });
}

/**
 * Le personnel valide qu'une récompense a été offerte en salle : le client
 * montre l'écran, la serveuse confirme. Aucune remise n'est appliquée
 * automatiquement ailleurs dans l'app - il n'existe pas de paiement en ligne.
 */
async function redeemReward(accountId, restaurantId, user) {
  const account = await prisma.loyaltyAccount.findFirst({
    where: { id: accountId, restaurantId },
  });
  if (!account) throw ApiError.notFound('Compte fidélité introuvable');
  if (account.rewardsAvailable <= 0) {
    throw ApiError.badRequest('Ce client n\'a aucune récompense disponible');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.loyaltyAccount.update({
      where: { id: account.id },
      data: { rewardsAvailable: { decrement: 1 }, rewardsRedeemed: { increment: 1 } },
    });

    await tx.loyaltyTransaction.create({
      data: {
        restaurantId,
        loyaltyAccountId: account.id,
        userId: user.id,
        type: 'REWARD_REDEEMED',
        points: 0,
      },
    });

    return updated;
  });
}

/** Ajustement manuel, réservé à l'administration : erreur, geste commercial. */
async function adjustPoints(accountId, restaurantId, delta, note, user) {
  const account = await prisma.loyaltyAccount.findFirst({
    where: { id: accountId, restaurantId },
  });
  if (!account) throw ApiError.notFound('Compte fidélité introuvable');

  const nextPoints = account.points + delta;
  if (nextPoints < 0) {
    throw ApiError.badRequest('Le solde de points ne peut pas devenir négatif');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.loyaltyAccount.update({
      where: { id: account.id },
      data: { points: nextPoints },
    });

    await tx.loyaltyTransaction.create({
      data: {
        restaurantId,
        loyaltyAccountId: account.id,
        userId: user.id,
        type: 'ADJUST',
        points: delta,
        note,
      },
    });

    return updated;
  });
}

module.exports = { awardForOrder, findAccountByPhone, redeemReward, adjustPoints };
