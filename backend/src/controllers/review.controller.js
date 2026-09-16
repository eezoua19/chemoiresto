const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');

function serialize(review) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    order: review.order
      ? {
          id: review.order.id,
          orderNumber: review.order.orderNumber,
          customerName: review.order.customerName,
          table: review.order.table
            ? { number: review.order.table.number, label: review.order.table.label }
            : null,
        }
      : null,
  };
}

const include = {
  order: { select: { id: true, orderNumber: true, customerName: true, table: { select: { number: true, label: true } } } },
};

/**
 * POST /api/reviews (route publique)
 * Le client note sa commande une fois servie. Un seul avis par commande :
 * la contrainte unique sur orderId l'empêche cote base, on la traduit ici
 * en message clair plutot que de laisser remonter l'erreur Prisma brute.
 */
const create = asyncHandler(async (req, res) => {
  const { trackingToken, rating, comment } = req.body;

  const order = await prisma.order.findUnique({ where: { trackingToken } });
  if (!order) throw ApiError.notFound('Commande introuvable');
  if (order.status !== 'SERVED') {
    throw ApiError.badRequest('L\'avis n\'est possible qu\'une fois la commande servie');
  }

  const existing = await prisma.review.findUnique({ where: { orderId: order.id } });
  if (existing) throw ApiError.conflict('Cette commande a déjà été notée');

  const review = await prisma.review.create({
    data: {
      restaurantId: order.restaurantId,
      orderId: order.id,
      rating,
      comment: comment || null,
    },
  });

  return created(res, { id: review.id, rating: review.rating, comment: review.comment }, 'Merci pour votre avis');
});

/** GET /api/reviews (personnel) */
const list = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { rating, from, to, page, pageSize } = req.query;

  const where = {
    restaurantId,
    ...(rating ? { rating } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  };

  const [total, reviews] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return success(
    res,
    {
      reviews: reviews.map(serialize),
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 1 },
    },
    'Avis récupérés'
  );
});

module.exports = { create, list, serialize };
