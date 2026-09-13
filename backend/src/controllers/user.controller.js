const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { dayRange, toNumber } = require('../utils/helpers');

const SALT_ROUNDS = 10;

function publicUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    orderCount: user._count ? user._count.orders : undefined,
  };
}

/** GET /api/users/servers */
const list = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    where: { restaurantId: req.user.restaurantId },
    orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    include: { _count: { select: { orders: true } } },
  });
  return success(res, users.map(publicUser), 'Utilisateurs récupérés');
});

/** POST /api/users/servers */
const create = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, password, role, status } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw ApiError.conflict('Cette adresse email est déjà utilisée');

  const user = await prisma.user.create({
    data: {
      restaurantId: req.user.restaurantId,
      firstName,
      lastName,
      email,
      phone: phone || null,
      password: await bcrypt.hash(password, SALT_ROUNDS),
      role: role || 'SERVER',
      status: status || 'ACTIVE',
    },
  });

  return created(res, publicUser(user), 'Compte créé');
});

/** PUT /api/users/servers/:id */
const update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const restaurantId = req.user.restaurantId;

  const user = await prisma.user.findFirst({ where: { id, restaurantId } });
  if (!user) throw ApiError.notFound('Utilisateur introuvable');

  if (req.body.email && req.body.email !== user.email) {
    const clash = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (clash) throw ApiError.conflict('Cette adresse email est déjà utilisée');
  }

  // Un administrateur ne peut pas se retirer lui-même ses droits ou se bloquer.
  if (user.id === req.user.id) {
    if (req.body.role && req.body.role !== user.role) {
      throw ApiError.badRequest('Vous ne pouvez pas modifier votre propre role');
    }
    if (req.body.status && req.body.status !== 'ACTIVE') {
      throw ApiError.badRequest('Vous ne pouvez pas désactiver votre propre compte');
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(req.body.firstName !== undefined ? { firstName: req.body.firstName } : {}),
      ...(req.body.lastName !== undefined ? { lastName: req.body.lastName } : {}),
      ...(req.body.email !== undefined ? { email: req.body.email } : {}),
      ...(req.body.phone !== undefined ? { phone: req.body.phone } : {}),
      ...(req.body.role !== undefined ? { role: req.body.role } : {}),
      ...(req.body.status !== undefined ? { status: req.body.status } : {}),
    },
  });

  return success(res, publicUser(updated), 'Compte mis à jour');
});

/** DELETE /api/users/servers/:id */
const remove = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (id === req.user.id) throw ApiError.badRequest('Vous ne pouvez pas supprimer votre propre compte');

  const user = await prisma.user.findFirst({
    where: { id, restaurantId: req.user.restaurantId },
    include: { _count: { select: { orders: true } } },
  });
  if (!user) throw ApiError.notFound('Utilisateur introuvable');

  // Historique preserve : on désactivé au lieu de supprimer.
  if (user._count.orders > 0) {
    req.journal = {
      label: `Compte désactivé (a traité des commandes) : ${user.firstName} ${user.lastName}`,
    };
    const disabled = await prisma.user.update({ where: { id }, data: { status: 'INACTIVE' } });
    return success(
      res,
      publicUser(disabled),
      'Ce compte a traité des commandes : il a été désactivé pour préserver l\'historique'
    );
  }

  req.journal = { label: `Compte supprimé : ${user.firstName} ${user.lastName}` };
  await prisma.user.delete({ where: { id } });
  return success(res, null, 'Compte supprimé');
});

/** PUT /api/users/servers/:id/password */
const resetPassword = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const user = await prisma.user.findFirst({ where: { id, restaurantId: req.user.restaurantId } });
  if (!user) throw ApiError.notFound('Utilisateur introuvable');

  await prisma.user.update({
    where: { id },
    data: { password: await bcrypt.hash(req.body.password, SALT_ROUNDS) },
  });

  return success(res, null, 'Mot de passe réinitialisé');
});

/** GET /api/users/servers/:id/activity */
const activity = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const restaurantId = req.user.restaurantId;

  const user = await prisma.user.findFirst({ where: { id, restaurantId } });
  if (!user) throw ApiError.notFound('Utilisateur introuvable');

  const { start } = dayRange(new Date());
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [todayCount, monthCount, revenue, recent] = await Promise.all([
    prisma.order.count({ where: { restaurantId, serverId: id, createdAt: { gte: start } } }),
    prisma.order.count({ where: { restaurantId, serverId: id, createdAt: { gte: monthStart } } }),
    prisma.order.aggregate({
      where: { restaurantId, serverId: id, status: 'SERVED', createdAt: { gte: monthStart } },
      _sum: { total: true },
    }),
    prisma.order.findMany({
      where: { restaurantId, serverId: id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { table: { select: { number: true } } },
    }),
  ]);

  return success(
    res,
    {
      user: publicUser(user),
      stats: {
        ordersToday: todayCount,
        ordersThisMonth: monthCount,
        revenueThisMonth: toNumber(revenue._sum.total) || 0,
      },
      recentOrders: recent.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: toNumber(order.total),
        tableNumber: order.table.number,
        createdAt: order.createdAt,
      })),
    },
    'Activité récupérée'
  );
});

module.exports = { list, create, update, remove, resetPassword, activity, publicUser };
