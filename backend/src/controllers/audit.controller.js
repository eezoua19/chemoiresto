const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { serialiser } = require('../services/audit.service');

/**
 * Journal des actions de gestion.
 *
 * Lecture seule, et c'est volontaire : un journal que l'on peut effacer ou
 * corriger ne prouve plus rien. Il n'existe donc ici ni suppression ni
 * modification, pas meme pour l'administrateur.
 */

/** GET /api/audit (ADMIN) */
const list = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const pageSize = Math.min(Number(req.query.pageSize) || 50, 200);
  const { action, entity, q, from, to } = req.query;

  const where = {
    restaurantId: req.user.restaurantId,
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(q
      ? {
          OR: [{ label: { contains: q } }, { userName: { contains: q } }],
        }
      : {}),
  };

  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(`${from}T00:00:00.000`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
    };
  }

  const [total, entrees] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { id: true } } },
    }),
  ]);

  return success(
    res,
    {
      entries: entrees.map(serialiser),
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 1 },
    },
    'Journal récupéré'
  );
});

/**
 * GET /api/audit/filters (ADMIN)
 * Les valeurs reellement presentes, pour ne pas proposer des filtres vides.
 */
const filters = asyncHandler(async (req, res) => {
  const where = { restaurantId: req.user.restaurantId };

  const [actions, entites] = await Promise.all([
    prisma.auditLog.groupBy({ by: ['action'], where, _count: { action: true } }),
    prisma.auditLog.groupBy({ by: ['entity'], where, _count: { entity: true } }),
  ]);

  return success(
    res,
    {
      actions: actions
        .map((ligne) => ({ value: ligne.action, count: ligne._count.action }))
        .sort((a, b) => b.count - a.count),
      entities: entites
        .map((ligne) => ({ value: ligne.entity, count: ligne._count.entity }))
        .sort((a, b) => b.count - a.count),
    },
    'Filtres récupérés'
  );
});

module.exports = { list, filters };
