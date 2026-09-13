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

/**
 * Rappels : combien de temps le client doit patienter avant de pouvoir
 * relancer, et combien de fois il peut le faire.
 *
 * 90 secondes laissent à la serveuse le temps de traverser la salle ; au-dela
 * de 3 rappels, insister ne sert plus a rien - c'est au comptoir que ca se
 * regle, et le personnel n'a pas a subir une sonnerie sans fin.
 */
const RAPPEL_DELAI_SECONDS = 90;
const RAPPEL_MAX = 3;

function serialize(request) {
  return {
    id: request.id,
    type: request.type,
    status: request.status,
    message: request.message,
    createdAt: request.createdAt,
    handledAt: request.handledAt,
    reminderCount: request.reminderCount,
    lastReminderAt: request.lastReminderAt,
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

/**
 * POST /api/service-requests/remind  (route publique)
 * Le client relance : personne n'est venu depuis son appel.
 *
 * On ne crée pas une seconde demande - la serveuse verrait deux lignes pour une
 * seule table. On rappelle la demande existante, et le personnel est re-alerté
 * à la voix comme au premier appel.
 */
const remind = asyncHandler(async (req, res) => {
  const { tableToken, type } = req.body;
  const table = await loadTableByToken(tableToken);

  const open = await prisma.serviceRequest.findFirst({
    where: { tableId: table.id, type, status: { in: OPEN_STATUSES[type] } },
    orderBy: { createdAt: 'desc' },
    include,
  });

  if (!open) {
    throw ApiError.notFound(
      type === 'BILL'
        ? "Aucune demande d'addition en cours. Demandez l'addition d'abord."
        : "Aucun appel en cours. Appelez une serveuse d'abord."
    );
  }

  if (open.reminderCount >= RAPPEL_MAX) {
    throw ApiError.tooMany(
      'Le personnel a déjà été relancé plusieurs fois. Adressez-vous directement au comptoir.'
    );
  }

  // Le compte à rebours part du dernier signal envoyé, appel initial compris.
  const dernierSignal = open.lastReminderAt || open.createdAt;
  const attenteRestante = Math.ceil(
    (new Date(dernierSignal).getTime() + RAPPEL_DELAI_SECONDS * 1000 - Date.now()) / 1000
  );
  if (attenteRestante > 0) {
    throw ApiError.tooMany(
      `Une serveuse arrive. Vous pourrez relancer dans ${attenteRestante} seconde${
        attenteRestante > 1 ? 's' : ''
      }.`
    );
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: open.id },
    data: { reminderCount: { increment: 1 }, lastReminderAt: new Date() },
    include,
  });

  const payload = serialize(updated);
  emitToStaff(table.restaurantId, 'service_request_reminder', payload);
  emitToStaff(table.restaurantId, 'service_request_updated', payload);
  emitToTable(tableToken, 'service_request_updated', payload);

  await createNotification({
    restaurantId: table.restaurantId,
    type: type === 'BILL' ? 'BILL_REQUEST' : 'CALL_SERVER',
    title: `Table ${table.number} - rappel (${TYPE_LABEL[type]})`,
    body: `${updated.reminderCount}e rappel : personne n'est encore venu.`,
    data: { serviceRequestId: updated.id, tableNumber: table.number, type, reminder: true },
  });

  return success(res, payload, 'Votre rappel a été transmis au personnel');
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

module.exports = { create, remind, list, listForTable, updateStatus };
