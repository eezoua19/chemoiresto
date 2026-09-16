const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { calculer, cloturer, serialiser } = require('../services/closing.service');
const { genererPdfComptable } = require('../services/accountingExport.service');
const { formatDate, today, normalizeDate } = require('../utils/helpers');

/**
 * Clotures de journee.
 *
 * Une journee passee est figee : on la relit telle qu'elle a ete arretee.
 * La journee en cours, elle, n'est pas figee - on la calcule a la volee et on
 * le dit clairement, sinon on lirait un chiffre d'affaires "definitif" a 11 h
 * du matin.
 */

/** GET /api/closings (ADMIN) - la liste, du plus recent au plus ancien */
const list = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const page = Number(req.query.page) || 1;
  const pageSize = Math.min(Number(req.query.pageSize) || 31, 100);
  const { from, to, includeEmpty } = req.query;

  const periode = { restaurantId };
  if (from || to) {
    periode.date = {
      ...(from ? { gte: normalizeDate(from) } : {}),
      ...(to ? { lte: normalizeDate(to) } : {}),
    };
  }

  // Une journee fermee reste enregistree ; elle n'est simplement pas affichee
  // tant qu'on ne la demande pas. Une page de zeros noierait les journees qui
  // comptent, et le cumul, lui, ne change pas d'un centime.
  const where = includeEmpty ? periode : { ...periode, ordersCount: { gt: 0 } };

  const [total, lignes, cumul, journeesVides] = await Promise.all([
    prisma.dailyClosing.count({ where }),
    prisma.dailyClosing.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.dailyClosing.aggregate({
      where,
      _sum: { revenue: true, ordersCount: true },
    }),
    prisma.dailyClosing.count({ where: { ...periode, ordersCount: 0 } }),
  ]);

  return success(
    res,
    {
      closings: lignes.map(serialiser),
      // Cumul sur toute la selection, pas seulement la page affichee.
      totals: {
        revenue: Number(cumul._sum.revenue || 0),
        orders: cumul._sum.ordersCount || 0,
        days: total,
      },
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 1 },
      // Ce que la liste ne montre pas, pour que le masquage soit dit.
      emptyDays: journeesVides,
    },
    'Clôtures récupérées'
  );
});

/**
 * GET /api/closings/today (ADMIN)
 * La journee en cours, calculee a l'instant. Rien n'est ecrit.
 */
const enCours = asyncHandler(async (req, res) => {
  const chiffres = await calculer(req.user.restaurantId, today());
  return success(res, { ...chiffres, closed: false }, 'Journée en cours');
});

/** GET /api/closings/:date (ADMIN) */
const detail = asyncHandler(async (req, res) => {
  const date = normalizeDate(req.params.date);
  if (!date) throw ApiError.badRequest('Date invalide');

  const ligne = await prisma.dailyClosing.findUnique({
    where: { restaurantId_date: { restaurantId: req.user.restaurantId, date } },
  });

  // Journee non encore cloturee : on la calcule plutot que de repondre 404.
  // Aujourd'hui n'est jamais fige, et une journee manquante ne doit pas
  // ressembler a une journee qui n'a pas existe.
  if (!ligne) {
    const chiffres = await calculer(req.user.restaurantId, date);
    const estAujourdhui = formatDate(date) === formatDate(today());
    return success(res, { ...chiffres, closed: false, isToday: estAujourdhui }, 'Journée calculée');
  }

  return success(res, { ...serialiser(ligne), closed: true, isToday: false }, 'Clôture récupérée');
});

/**
 * POST /api/closings/:date (ADMIN)
 * Cloturer ou recalculer une journee a la main. Utile apres une correction de
 * commande passee : les chiffres figes doivent pouvoir etre remis d'aplomb.
 */
const fermer = asyncHandler(async (req, res) => {
  const date = normalizeDate(req.params.date);
  if (!date) throw ApiError.badRequest('Date invalide');
  if (date > today()) throw ApiError.badRequest('On ne clôture pas une journée à venir');

  const ligne = await cloturer(req.user.restaurantId, date);
  return success(
    res,
    { ...serialiser(ligne), closed: true },
    `Journée du ${formatDate(date)} clôturée`
  );
});

/**
 * GET /api/closings/export/pdf (ADMIN)
 * Recapitulatif comptable de la periode, pret a envoyer au comptable. Ne
 * porte que sur les journees deja cloturees : une journee non figee pourrait
 * encore bouger, un document comptable non.
 */
const exporterComptable = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const from = normalizeDate(req.query.from);
  const to = normalizeDate(req.query.to);
  if (!from || !to) throw ApiError.badRequest('Période invalide');
  if (from > to) throw ApiError.badRequest('La date de début doit précéder la date de fin');
  if ((to - from) / 86400000 > 366) throw ApiError.badRequest('La période ne peut pas dépasser un an');

  const [restaurant, lignes] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true, currency: true } }),
    prisma.dailyClosing.findMany({
      where: { restaurantId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    }),
  ]);

  const nomFichier = `export-comptable-${formatDate(from)}-au-${formatDate(to)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);

  genererPdfComptable(res, { restaurant, from, to, closings: lignes.map(serialiser) });
});

module.exports = { list, detail, enCours, fermer, exporterComptable };
