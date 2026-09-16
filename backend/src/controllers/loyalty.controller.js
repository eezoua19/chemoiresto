const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const loyaltyService = require('../services/loyalty.service');

function serialize(account) {
  return {
    id: account.id,
    phone: account.phone,
    name: account.name,
    points: account.points,
    rewardsAvailable: account.rewardsAvailable,
    rewardsRedeemed: account.rewardsRedeemed,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function serializeTransaction(tx) {
  return {
    id: tx.id,
    orderId: tx.orderId,
    type: tx.type,
    points: tx.points,
    note: tx.note,
    createdAt: tx.createdAt,
    user: tx.user ? { id: tx.user.id, fullName: `${tx.user.firstName} ${tx.user.lastName}` } : null,
  };
}

/** GET /api/loyalty (personnel) */
const list = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { search, page, pageSize } = req.query;

  const terme = search ? String(search).trim() : '';
  const where = {
    restaurantId,
    ...(terme
      ? { OR: [{ phone: { contains: terme } }, { name: { contains: terme } }] }
      : {}),
  };

  const [total, accounts] = await Promise.all([
    prisma.loyaltyAccount.count({ where }),
    prisma.loyaltyAccount.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return success(
    res,
    {
      accounts: accounts.map(serialize),
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 1 },
    },
    'Comptes fidélité récupérés'
  );
});

/** GET /api/loyalty/:id (personnel) */
const detail = asyncHandler(async (req, res) => {
  const account = await prisma.loyaltyAccount.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
  });
  if (!account) throw ApiError.notFound('Compte fidélité introuvable');

  const transactions = await prisma.loyaltyTransaction.findMany({
    where: { loyaltyAccountId: account.id },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return success(
    res,
    { ...serialize(account), transactions: transactions.map(serializeTransaction) },
    'Compte fidélité récupéré'
  );
});

/** POST /api/loyalty/:id/redeem (personnel) - le client montre son écran, la serveuse valide. */
const redeem = asyncHandler(async (req, res) => {
  const account = await loyaltyService.redeemReward(req.params.id, req.user.restaurantId, req.user);
  return success(res, serialize(account), 'Récompense validée');
});

/** POST /api/loyalty/:id/adjust (ADMIN) - ajustement manuel avec motif. */
const adjust = asyncHandler(async (req, res) => {
  const { delta, note } = req.body;
  const account = await loyaltyService.adjustPoints(
    req.params.id,
    req.user.restaurantId,
    delta,
    note,
    req.user
  );
  return success(res, serialize(account), 'Points ajustés');
});

module.exports = { list, detail, redeem, adjust, serialize };
