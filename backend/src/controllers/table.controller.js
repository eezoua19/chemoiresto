const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { randomToken } = require('../utils/helpers');
const { upsertQRCode, buildTableUrl } = require('../services/qrcode.service');

const include = { qrCode: true, _count: { select: { orders: true } } };

function serialize(table) {
  return {
    id: table.id,
    number: table.number,
    label: table.label,
    capacity: table.capacity,
    token: table.token,
    status: table.status,
    menuUrl: buildTableUrl(table.token),
    orderCount: table._count ? table._count.orders : undefined,
    qrCode: table.qrCode
      ? {
          id: table.qrCode.id,
          url: table.qrCode.url,
          dataUrl: table.qrCode.dataUrl,
          version: table.qrCode.version,
          updatedAt: table.qrCode.updatedAt,
        }
      : null,
    createdAt: table.createdAt,
  };
}

/** GET /api/tables */
const list = asyncHandler(async (req, res) => {
  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId: req.user.restaurantId },
    orderBy: { number: 'asc' },
    include,
  });
  return success(res, tables.map(serialize), 'Tables récupérées');
});

/** GET /api/tables/:id */
const detail = asyncHandler(async (req, res) => {
  const table = await prisma.restaurantTable.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
    include,
  });
  if (!table) throw ApiError.notFound('Table introuvable');
  return success(res, serialize(table), 'Table récupérée');
});

/**
 * POST /api/tables
 * Le QR Code est génère immédiatement : une table est inutilisable sans lui.
 */
const create = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { number, label, capacity, status } = req.body;

  const existing = await prisma.restaurantTable.findFirst({ where: { restaurantId, number } });
  if (existing) throw ApiError.conflict(`La table "${number}" existe déjà`);

  const table = await prisma.restaurantTable.create({
    data: {
      restaurantId,
      number,
      label: label || null,
      capacity: capacity ?? 4,
      status: status || 'ACTIVE',
      token: randomToken(16),
    },
  });

  await upsertQRCode(table.id, table.token);

  const full = await prisma.restaurantTable.findUnique({ where: { id: table.id }, include });
  return created(res, serialize(full), 'Table créée avec son QR Code');
});

/** PUT /api/tables/:id */
const update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const restaurantId = req.user.restaurantId;

  const table = await prisma.restaurantTable.findFirst({ where: { id, restaurantId } });
  if (!table) throw ApiError.notFound('Table introuvable');

  if (req.body.number && req.body.number !== table.number) {
    const clash = await prisma.restaurantTable.findFirst({
      where: { restaurantId, number: req.body.number, NOT: { id } },
    });
    if (clash) throw ApiError.conflict(`La table "${req.body.number}" existe déjà`);
  }

  const updated = await prisma.restaurantTable.update({
    where: { id },
    data: {
      ...(req.body.number !== undefined ? { number: req.body.number } : {}),
      ...(req.body.label !== undefined ? { label: req.body.label } : {}),
      ...(req.body.capacity !== undefined ? { capacity: req.body.capacity } : {}),
      ...(req.body.status !== undefined ? { status: req.body.status } : {}),
    },
    include,
  });

  return success(res, serialize(updated), 'Table mise à jour');
});

/** DELETE /api/tables/:id */
const remove = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const table = await prisma.restaurantTable.findFirst({
    where: { id, restaurantId: req.user.restaurantId },
    include: { _count: { select: { orders: true } } },
  });
  if (!table) throw ApiError.notFound('Table introuvable');

  if (table._count.orders > 0) {
    throw ApiError.conflict(
      'Cette table possède un historique de commandes. Désactivez-la plutot que de la supprimer.'
    );
  }

  await prisma.restaurantTable.delete({ where: { id } });
  return success(res, null, 'Table supprimée');
});

/** PATCH /api/tables/:id/status - bascule actif / inactif */
const toggleStatus = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const table = await prisma.restaurantTable.findFirst({
    where: { id, restaurantId: req.user.restaurantId },
  });
  if (!table) throw ApiError.notFound('Table introuvable');

  const updated = await prisma.restaurantTable.update({
    where: { id },
    data: { status: table.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
    include,
  });

  return success(
    res,
    serialize(updated),
    updated.status === 'ACTIVE' ? 'Table activée' : 'Table désactivée'
  );
});

/** GET /api/tables/:id/qrcode */
const getQRCode = asyncHandler(async (req, res) => {
  const table = await prisma.restaurantTable.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
    include: { qrCode: true },
  });
  if (!table) throw ApiError.notFound('Table introuvable');

  let qrCode = table.qrCode;
  if (!qrCode) qrCode = await upsertQRCode(table.id, table.token);

  return success(res, { table: { id: table.id, number: table.number }, qrCode }, 'QR Code récupéré');
});

/** POST /api/tables/:id/qrcode - (re)génère l'image sans changer le jeton */
const generateQRCode = asyncHandler(async (req, res) => {
  const table = await prisma.restaurantTable.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
  });
  if (!table) throw ApiError.notFound('Table introuvable');

  const qrCode = await upsertQRCode(table.id, table.token);
  return success(res, qrCode, 'QR Code généré');
});

/**
 * POST /api/tables/:id/qrcode/regenerate
 * Génère un NOUVEAU jeton : les anciens QR Codes imprimes cessent de fonctionner.
 */
const regenerateQRCode = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const table = await prisma.restaurantTable.findFirst({
    where: { id, restaurantId: req.user.restaurantId },
  });
  if (!table) throw ApiError.notFound('Table introuvable');

  const updated = await prisma.restaurantTable.update({
    where: { id },
    data: { token: randomToken(16) },
  });

  const qrCode = await upsertQRCode(updated.id, updated.token);

  return success(
    res,
    { table: serialize({ ...updated, qrCode }), qrCode },
    'Nouveau QR Code généré : pensez à réimprimer celui de la table'
  );
});

/** GET /api/tables/qrcodes/all - jeu complet pour l'impression groupee */
const listQRCodes = asyncHandler(async (req, res) => {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: req.user.restaurantId },
    select: { name: true, logo: true, welcomeMessage: true },
  });

  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId: req.user.restaurantId },
    orderBy: { number: 'asc' },
    include: { qrCode: true },
  });

  // Génère à la volee les QR Codes manquants pour ne rien oublier à l'impression.
  const withCodes = [];
  for (const table of tables) {
    let qrCode = table.qrCode;
    if (!qrCode) qrCode = await upsertQRCode(table.id, table.token);
    withCodes.push({
      id: table.id,
      number: table.number,
      label: table.label,
      status: table.status,
      dataUrl: qrCode.dataUrl,
      url: qrCode.url,
    });
  }

  return success(res, { restaurant, tables: withCodes }, 'QR Codes récupérés');
});

module.exports = {
  list,
  detail,
  create,
  update,
  remove,
  toggleStatus,
  getQRCode,
  generateQRCode,
  regenerateQRCode,
  listQRCodes,
};
