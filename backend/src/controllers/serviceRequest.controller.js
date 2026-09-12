const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { loadTableByToken } = require('./public.controller');
const { createNotification } = require('../services/notification.service');
const { emitToStaff, emitToTable } = require('../sockets');

/** Statuts ouverts selon le type de demande. */
const OPEN_STATUSES = {
  CALL_SERVER: ['PENDING', 'TAKEN'],
  BILL: ['REQUESTED', 'PROCESSING'],
};

const INITIAL_STATUS = { CALL_SERVER: 'PENDING', BILL: 'REQUESTED' };

const ALLOWED_STATUSES = {
  CALL_SERVER: ['PENDING', 'TAKEN', 'COMPLETED', 'CANCELLED'],
  BILL: ['REQUESTED', 'PROCESSING', 'PAID', 'CANCELLED'],
};

const TYPE_LABEL = { CALL_SERVER: 'Appel serveuse', BILL: 'Demande d\'addition' };

/** Delai minimum entre deux demandes identiques depuis la même table. */
const ANTI_SPAM_SECONDS = 60;

function serialize(request) {
  return {
    id: request.id,
    type: request.type,
    status: request.status,
    message: request.message,
    createdAt: request.createdAt,
    handledAt: request.handledAt,
    table: request.table
      ? { id: request.table.id, number: request.table.number, label: request.table.label }
      : null,
    handledBy: request.handledBy
      ? {
          id: request.handledBy.id,
          fullName: `${request.handledBy.firstName} ${request.handledBy.lastName}`,
        }
      : null,
  };
}

const include = {
  table: { select: { id: true, number: true, label: true, token: true } },
  handledBy: { select: { id: true, firstName: true, lastName: true } },
};

/**
 * POST /api/service-requests  (route publique)
 * Le client appelle une serveuse ou demande l'addition.
 * Protection anti-spam : une demande ouverte du même type bloque les suivantes.
 */
const create = asyncHandler(async (req, res) => {
  const { tableToken, type, message } = req.body;
  const table = await loadTableByToken(tableToken);

  const existingOpen = await prisma.serviceRequest.findFirst({
    where: { tableId: table.id, type, status: { in: OPEN_STATUSES[type] } },
    orderBy: { createdAt: 'desc' },
    include,
  });

  if (existingOpen) {
    return success(
      res,
      serialize(existingOpen),
      type === 'BILL'
        ? 'Votre demande d\'addition a déjà été transmise'
        : 'Une serveuse a déjà été appelée et arrive'
    );
  }

  const recent = await prisma.serviceRequest.findFirst({
    where: {
      tableId: table.id,
      type,
      createdAt: { gte: new Date(Date.now() - ANTI_SPAM_SECONDS * 1000) },
    },
  });
  if (recent) {
    throw ApiError.tooMany('Votre demande vient d\'être envoyée. Patientez un instant.');
  }

  const request = await prisma.serviceRequest.create({
    data: {
      restaurantId: table.restaurantId,
      tableId: table.id,
      type,
      status: INITIAL_STATUS[type],
      message: message || null,
    },
    include,
  });

  const payload = serialize(request);
  emitToStaff(table.restaurantId, 'service_request', payload);

  await createNotification({
    restaurantId: table.restaurantId,
    type: type === 'BILL' ? 'BILL_REQUEST' : 'CALL_SERVER',
    title: `Table ${table.number} - ${TYPE_LABEL[type]}`,
    body: message || null,
    data: { serviceRequestId: request.id, tableNumber: table.number, type },
  });

  return created(
    res,
    payload,
    type === 'BILL' ? 'Votre demande d\'addition a été envoyée' : 'Votre demande a été envoyée'
  );
});

/** GET /api/service-requests/table/:token - état des demandes côté client */
const listForTable = asyncHandler(async (req, res) => {
  const table = await loadTableByToken(req.params.token);

  const requests = await prisma.serviceRequest.findMany({
    where: {
      tableId: table.id,
      status: { in: ['PENDING', 'TAKEN', 'REQUESTED', 'PROCESSING'] },
    },
    orderBy: { createdAt: 'desc' },
    include,
  });

  return success(res, requests.map(serialize), 'Demandes récupérées');
});

/** GET /api/service-requests  (personnel) */
const list = asyncHandler(async (req, res) => {
  const onlyOpen = req.query.open !== 'false';

  const requests = await prisma.serviceRequest.findMany({
    where: {
      restaurantId: req.user.restaurantId,
      ...(onlyOpen ? { status: { in: ['PENDING', 'TAKEN', 'REQUESTED', 'PROCESSING'] } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include,
  });

  return success(res, requests.map(serialize), 'Demandes récupérées');
});

/** PUT /api/service-requests/:id/status  (personnel) */
const updateStatus = asyncHandler(async (req, res) => {
  const request = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
    include,
  });
  if (!request) throw ApiError.notFound('Demande introuvable');

  const { status } = req.body;
  if (!ALLOWED_STATUSES[request.type].includes(status)) {
    throw ApiError.badRequest(
      `Statut "${status}" invalide pour une demande de type ${TYPE_LABEL[request.type]}`
    );
  }

  const isClosing = ['COMPLETED', 'PAID', 'CANCELLED'].includes(status);

  const updated = await prisma.serviceRequest.update({
    where: { id: request.id },
    data: {
      status,
      handledById: req.user.id,
      handledAt: isClosing ? new Date() : request.handledAt,
    },
    include,
  });

  const payload = serialize(updated);
  emitToStaff(req.user.restaurantId, 'service_request_updated', payload);
  if (request.table) emitToTable(request.table.token, 'service_request_updated', payload);

  return success(res, payload, 'Demande mise à jour');
});

module.exports = { create, list, listForTable, updateStatus };
