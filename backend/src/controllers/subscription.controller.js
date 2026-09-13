const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { buildSubscriptionUrl, renderUrl } = require('../services/qrcode.service');
const { emitToStaff } = require('../sockets');
const {
  debutDeJour,
  finDeJour,
  ajouterJours,
  expirationProposee,
  etatEffectif,
  autoriseUtilisation,
  MESSAGES,
  creerAbonnement,
  inclusion,
  inclusionUsages,
  serialiser,
  serialiserUtilisation,
} = require('../services/subscription.service');

// ---------------------------------------------------------------------------
// Ticket
// ---------------------------------------------------------------------------

/** Ticket numerique : ce qui est imprime et remis a l'abonne. */
async function construireTicket(subscription) {
  const url = buildSubscriptionUrl(subscription.verifyToken);
  return { url, qrDataUrl: await renderUrl(url) };
}

/**
 * Previent tous les appareils du personnel.
 *
 * Le reste de l'application pousse deja ses changements en direct (commandes,
 * appels, ruptures de stock). Les abonnements ne doivent pas faire exception :
 * une suspension decidee au bureau doit apparaitre sur le telephone de la
 * serveuse qui a la fiche ouverte, sans qu'elle ait a rafraichir.
 *
 * La securite, elle, ne repose pas la-dessus : chaque scan et chaque
 * enregistrement de passage sont revalides par le serveur.
 */
function prevenirLePersonnel(restaurantId, evenement, subscription, extra = {}) {
  emitToStaff(restaurantId, evenement, { subscription: serialiser(subscription), ...extra });
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

/** GET /api/subscriptions */
const list = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { search, state, page, pageSize } = req.query;
  const maintenant = new Date();

  const terme = search ? String(search).trim() : '';
  const where = {
    restaurantId,
    ...(terme
      ? {
          OR: [
            { number: { contains: terme } },
            { phone: { contains: terme } },
            { firstName: { contains: terme } },
            { lastName: { contains: terme } },
          ],
        }
      : {}),
  };

  // L'expiration se calcule, elle n'est pas stockee : on la traduit en filtre
  // de dates plutot que d'aller chercher un statut qui n'existe pas.
  if (state === 'VALIDE') {
    Object.assign(where, {
      status: 'ACTIVE',
      startDate: { lte: maintenant },
      endDate: { gte: maintenant },
    });
  } else if (state === 'EXPIRE') {
    Object.assign(where, { status: { not: 'INACTIVE' }, endDate: { lt: maintenant } });
  } else if (state === 'SUSPENDU') {
    Object.assign(where, { status: 'SUSPENDED' });
  } else if (state === 'INACTIF') {
    Object.assign(where, { status: 'INACTIVE' });
  } else if (state === 'BIENTOT') {
    Object.assign(where, {
      status: 'ACTIVE',
      endDate: { gte: maintenant, lte: finDeJour(ajouterJours(maintenant, 7)) },
    });
  }

  const [total, abonnements] = await Promise.all([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      where,
      include: inclusion,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return success(
    res,
    {
      subscriptions: abonnements.map((a) => serialiser(a, maintenant)),
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 1 },
    },
    'Abonnements récupérés'
  );
});

/** GET /api/subscriptions/stats */
const stats = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const maintenant = new Date();
  const dansSeptJours = finDeJour(ajouterJours(maintenant, 7));
  const debutDuMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1, 0, 0, 0, 0);

  const [total, valides, expires, suspendus, inactifs, bientot, utilisations, utilisationsMois, dernieres] =
    await Promise.all([
      prisma.subscription.count({ where: { restaurantId } }),
      prisma.subscription.count({
        where: {
          restaurantId,
          status: 'ACTIVE',
          startDate: { lte: maintenant },
          endDate: { gte: maintenant },
        },
      }),
      prisma.subscription.count({
        where: { restaurantId, status: { not: 'INACTIVE' }, endDate: { lt: maintenant } },
      }),
      prisma.subscription.count({ where: { restaurantId, status: 'SUSPENDED' } }),
      prisma.subscription.count({ where: { restaurantId, status: 'INACTIVE' } }),
      prisma.subscription.count({
        where: {
          restaurantId,
          status: 'ACTIVE',
          endDate: { gte: maintenant, lte: dansSeptJours },
        },
      }),
      prisma.subscriptionUsage.count({ where: { restaurantId } }),
      prisma.subscriptionUsage.count({
        where: { restaurantId, createdAt: { gte: debutDuMois } },
      }),
      prisma.subscriptionUsage.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          order: { select: { id: true, orderNumber: true, total: true } },
          subscription: { select: { id: true, number: true, firstName: true, lastName: true } },
        },
      }),
    ]);

  return success(
    res,
    {
      counts: { total, valides, expires, suspendus, inactifs, bientot },
      usages: { total: utilisations, month: utilisationsMois },
      recent: dernieres.map((u) => ({
        ...serialiserUtilisation(u),
        subscription: {
          id: u.subscription.id,
          number: u.subscription.number,
          fullName: `${u.subscription.firstName} ${u.subscription.lastName}`,
        },
      })),
    },
    'Statistiques des abonnements récupérées'
  );
});

/** GET /api/subscriptions/:id */
const detail = asyncHandler(async (req, res) => {
  const subscription = await prisma.subscription.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
    include: inclusionUsages,
  });
  if (!subscription) throw ApiError.notFound('Abonnement introuvable');

  return success(
    res,
    { ...serialiser(subscription), ticket: await construireTicket(subscription) },
    'Abonnement récupéré'
  );
});

/** POST /api/subscriptions (ADMIN) */
const create = asyncHandler(async (req, res) => {
  const { firstName, lastName, phone, plan, startDate, endDate, amount, note } = req.body;

  const debut = debutDeJour(startDate ? new Date(startDate) : new Date());
  const fin = endDate ? finDeJour(new Date(endDate)) : expirationProposee(debut, plan);

  if (fin < debut) {
    throw ApiError.badRequest("La date d'expiration doit suivre la date de début");
  }

  const subscription = await creerAbonnement({
    restaurantId: req.user.restaurantId,
    createdById: req.user.id,
    firstName,
    lastName,
    phone,
    plan,
    startDate: debut,
    endDate: fin,
    amount: amount === undefined || amount === null || amount === '' ? null : amount,
    note: note || null,
  });

  if (!subscription) throw ApiError.badRequest("Impossible de générer un numéro d'abonnement");

  prevenirLePersonnel(req.user.restaurantId, 'subscription_updated', subscription);

  return created(
    res,
    { ...serialiser(subscription), ticket: await construireTicket(subscription) },
    `Abonnement ${subscription.number} créé`
  );
});

/** PUT /api/subscriptions/:id (ADMIN) */
const update = asyncHandler(async (req, res) => {
  const existant = await prisma.subscription.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
  });
  if (!existant) throw ApiError.notFound('Abonnement introuvable');

  const data = {};
  for (const champ of ['firstName', 'lastName', 'phone', 'plan', 'note']) {
    if (req.body[champ] !== undefined) data[champ] = req.body[champ] === '' ? null : req.body[champ];
  }
  if (req.body.amount !== undefined) {
    data.amount = req.body.amount === null || req.body.amount === '' ? null : req.body.amount;
  }
  if (req.body.startDate !== undefined) data.startDate = debutDeJour(new Date(req.body.startDate));
  if (req.body.endDate !== undefined) data.endDate = finDeJour(new Date(req.body.endDate));

  const debut = data.startDate || existant.startDate;
  const fin = data.endDate || existant.endDate;
  if (new Date(fin) < new Date(debut)) {
    throw ApiError.badRequest("La date d'expiration doit suivre la date de début");
  }

  const subscription = await prisma.subscription.update({
    where: { id: existant.id },
    data,
    include: inclusion,
  });

  prevenirLePersonnel(req.user.restaurantId, 'subscription_updated', subscription);
  return success(res, serialiser(subscription), 'Abonnement mis à jour');
});

/** PATCH /api/subscriptions/:id/status (ADMIN) */
const setStatus = asyncHandler(async (req, res) => {
  const existant = await prisma.subscription.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
  });
  if (!existant) throw ApiError.notFound('Abonnement introuvable');

  const subscription = await prisma.subscription.update({
    where: { id: existant.id },
    data: { status: req.body.status },
    include: inclusion,
  });

  prevenirLePersonnel(req.user.restaurantId, 'subscription_updated', subscription);

  const messages = {
    ACTIVE: 'Abonnement réactivé',
    SUSPENDED: 'Abonnement suspendu',
    INACTIVE: 'Abonnement désactivé',
  };
  return success(res, serialiser(subscription), messages[req.body.status]);
});

/** POST /api/subscriptions/:id/renew (ADMIN) */
const renew = asyncHandler(async (req, res) => {
  const existant = await prisma.subscription.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
  });
  if (!existant) throw ApiError.notFound('Abonnement introuvable');

  const maintenant = new Date();
  const plan = req.body.plan || existant.plan;

  // Renouveler avant l'echeance ne doit pas faire perdre les jours restants :
  // on enchaine a la suite. Une fois expire, on repart d'aujourd'hui.
  const encoreValide = new Date(existant.endDate) >= maintenant;
  const debut = encoreValide
    ? debutDeJour(ajouterJours(existant.endDate, 1))
    : debutDeJour(maintenant);
  const fin = req.body.endDate ? finDeJour(new Date(req.body.endDate)) : expirationProposee(debut, plan);

  const subscription = await prisma.subscription.update({
    where: { id: existant.id },
    data: {
      plan,
      startDate: debut,
      endDate: fin,
      status: 'ACTIVE',
      renewalCount: existant.renewalCount + 1,
      renewedAt: maintenant,
      ...(req.body.amount !== undefined && req.body.amount !== '' ? { amount: req.body.amount } : {}),
    },
    include: inclusion,
  });

  prevenirLePersonnel(req.user.restaurantId, 'subscription_updated', subscription);
  return success(res, serialiser(subscription), `Abonnement renouvelé jusqu'au ${fin.toLocaleDateString('fr-FR')}`);
});

/** GET /api/subscriptions/:id/ticket (ADMIN) */
const ticket = asyncHandler(async (req, res) => {
  const subscription = await prisma.subscription.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
    include: inclusion,
  });
  if (!subscription) throw ApiError.notFound('Abonnement introuvable');

  return success(
    res,
    { ...serialiser(subscription), ticket: await construireTicket(subscription) },
    'Ticket généré'
  );
});

// ---------------------------------------------------------------------------
// Verification par le personnel
// ---------------------------------------------------------------------------

/**
 * GET /api/subscriptions/verify/:token
 *
 * Consulter NE consomme PAS de passage : le personnel scanne, lit l'etat, puis
 * valide explicitement l'utilisation. Sans cette separation, un ticket scanne
 * deux fois par erreur compterait deux passages.
 */
const verify = asyncHandler(async (req, res) => {
  const subscription = await prisma.subscription.findFirst({
    where: { verifyToken: req.params.token, restaurantId: req.user.restaurantId },
    include: inclusionUsages,
  });

  if (!subscription) {
    return success(
      res,
      { found: false, state: 'INTROUVABLE', stateLabel: MESSAGES.INTROUVABLE, isUsable: false },
      MESSAGES.INTROUVABLE
    );
  }

  const donnees = serialiser(subscription);
  return success(res, { found: true, ...donnees }, donnees.stateLabel);
});

/**
 * GET /api/subscriptions/lookup?q=...
 *
 * Le filet de securite du comptoir : ticket dechire, QR illisible, telephone
 * sans appareil photo. Le personnel tape le numero d'abonnement ou le numero
 * de telephone et retrouve la fiche, avec son etat.
 */
const lookup = asyncHandler(async (req, res) => {
  const terme = String(req.query.q).trim();
  const maintenant = new Date();

  const abonnements = await prisma.subscription.findMany({
    where: {
      restaurantId: req.user.restaurantId,
      OR: [
        { number: { contains: terme } },
        { phone: { contains: terme } },
        { lastName: { contains: terme } },
        { firstName: { contains: terme } },
      ],
    },
    include: inclusion,
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return success(
    res,
    { results: abonnements.map((a) => serialiser(a, maintenant)) },
    abonnements.length ? 'Abonnements trouvés' : 'Aucun abonnement ne correspond'
  );
});

/**
 * POST /api/subscriptions/verify/:token/use
 * Enregistre le passage. Refuse tout ce qui n'est pas un abonnement valide.
 */
const use = asyncHandler(async (req, res) => {
  const subscription = await prisma.subscription.findFirst({
    where: { verifyToken: req.params.token, restaurantId: req.user.restaurantId },
  });
  if (!subscription) throw ApiError.notFound(MESSAGES.INTROUVABLE);

  const etat = etatEffectif(subscription);
  if (!autoriseUtilisation(etat)) {
    throw ApiError.badRequest(`${MESSAGES[etat]} : utilisation refusée`);
  }

  if (req.body.orderId) {
    const commande = await prisma.order.findFirst({
      where: { id: req.body.orderId, restaurantId: req.user.restaurantId },
    });
    if (!commande) throw ApiError.badRequest('Commande associée introuvable');
  }

  await prisma.subscriptionUsage.create({
    data: {
      restaurantId: req.user.restaurantId,
      subscriptionId: subscription.id,
      userId: req.user.id,
      type: req.body.type || 'REPAS',
      orderId: req.body.orderId || null,
      note: req.body.note || null,
    },
  });

  const rafraichi = await prisma.subscription.findUnique({
    where: { id: subscription.id },
    include: inclusionUsages,
  });

  prevenirLePersonnel(req.user.restaurantId, 'subscription_used', rafraichi, {
    by: `${req.user.firstName} ${req.user.lastName}`,
  });

  return created(
    res,
    serialiser(rafraichi),
    `Passage enregistré pour ${subscription.firstName} ${subscription.lastName}`
  );
});

/**
 * DELETE /api/subscriptions/:id (ADMIN)
 *
 * Suppression definitive. Les passages enregistres partent avec l'abonnement
 * (cascade en base) : c'est pour cela qu'on les compte AVANT d'effacer et
 * qu'on le dit dans la reponse - l'administration doit savoir ce qu'elle vient
 * de perdre, pas le decouvrir en cherchant un historique disparu.
 *
 * Desactiver reste le geste normal ; supprimer sert aux fiches creees par
 * erreur. Le choix appartient a l'administration, pas au code.
 */
const remove = asyncHandler(async (req, res) => {
  const existant = await prisma.subscription.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
    include: inclusion,
  });
  if (!existant) throw ApiError.notFound('Abonnement introuvable');

  const passages = await prisma.subscriptionUsage.count({
    where: { subscriptionId: existant.id },
  });

  req.journal = {
    label: `Abonnement supprimé : ${existant.firstName} ${existant.lastName} (${existant.number})`,
    details: { passages },
  };
  await prisma.subscription.delete({ where: { id: existant.id } });

  // Le personnel peut avoir la fiche ouverte au comptoir : on previent, sinon
  // l'ecran continue d'afficher un abonnement qui n'existe plus.
  prevenirLePersonnel(req.user.restaurantId, 'subscription_deleted', existant, { passages });

  return success(
    res,
    { id: existant.id, number: existant.number, passages },
    passages > 0
      ? `Abonnement ${existant.number} supprimé, ainsi que ${passages} passage${
          passages > 1 ? 's' : ''
        } enregistré${passages > 1 ? 's' : ''}`
      : `Abonnement ${existant.number} supprimé`
  );
});

module.exports = {
  list,
  stats,
  detail,
  create,
  update,
  setStatus,
  renew,
  remove,
  ticket,
  verify,
  lookup,
  use,
};
