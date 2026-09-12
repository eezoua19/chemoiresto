const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { dayRange, toNumber, today, formatDate } = require('../utils/helpers');

const MOIS = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
];

/** Bornes d'un mois calendaire : du 1er a 00h00 au 1er du mois suivant. */
function bornesDuMois(annee, moisIndex) {
  return {
    debut: new Date(annee, moisIndex, 1, 0, 0, 0, 0),
    fin: new Date(annee, moisIndex + 1, 1, 0, 0, 0, 0),
  };
}

function cleDuJour(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * GET /api/dashboard/stats?month=AAAA-MM
 *
 * Sans parametre, le mois en cours. Les indicateurs du bloc `today` restent
 * ceux du jour reel : ils servent au service en cours, pas a l'analyse.
 *
 * La periode est un vrai mois calendaire et non une fenetre glissante de
 * 30 jours : « septembre » doit vouloir dire septembre, sinon les chiffres ne
 * se comparent pas d'un mois sur l'autre.
 */
const stats = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { start: todayStart, end: todayEnd } = dayRange(new Date());

  const maintenant = new Date();
  const [anneeDemandee, moisDemande] = (req.query.month || '')
    .split('-')
    .map((valeur) => Number(valeur));

  const annee = Number.isFinite(anneeDemandee) && anneeDemandee ? anneeDemandee : maintenant.getFullYear();
  const moisIndex = Number.isFinite(moisDemande) && moisDemande ? moisDemande - 1 : maintenant.getMonth();

  const { debut: periodeDebut, fin: periodeFin } = bornesDuMois(annee, moisIndex);
  const moisCourant = annee === maintenant.getFullYear() && moisIndex === maintenant.getMonth();
  const nombreDeJours = new Date(annee, moisIndex + 1, 0).getDate();

  const chartStart = periodeDebut;

  const [
    ordersToday,
    revenueToday,
    pendingCount,
    servedToday,
    activeTables,
    totalTables,
    availableProducts,
    totalProducts,
    openRequests,
    chartOrders,
    todayMenu,
  ] = await Promise.all([
    prisma.order.count({
      where: { restaurantId, createdAt: { gte: todayStart, lt: todayEnd } },
    }),
    prisma.order.aggregate({
      where: {
        restaurantId,
        createdAt: { gte: todayStart, lt: todayEnd },
        status: { not: 'CANCELLED' },
      },
      _sum: { total: true },
    }),
    prisma.order.count({
      where: {
        restaurantId,
        createdAt: { gte: todayStart, lt: todayEnd },
        status: { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] },
      },
    }),
    prisma.order.count({
      where: { restaurantId, createdAt: { gte: todayStart, lt: todayEnd }, status: 'SERVED' },
    }),
    prisma.restaurantTable.count({ where: { restaurantId, status: 'ACTIVE' } }),
    prisma.restaurantTable.count({ where: { restaurantId } }),
    prisma.product.count({ where: { restaurantId, isActive: true, isAvailable: true } }),
    prisma.product.count({ where: { restaurantId, isActive: true } }),
    prisma.serviceRequest.count({
      where: {
        restaurantId,
        status: { in: ['PENDING', 'TAKEN', 'REQUESTED', 'PROCESSING'] },
      },
    }),
    prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: periodeDebut, lt: periodeFin },
        status: { not: 'CANCELLED' },
      },
      select: { createdAt: true, total: true },
    }),
    prisma.dailyMenu.findUnique({
      where: { restaurantId_date: { restaurantId, date: today() } },
      include: { _count: { select: { items: true } } },
    }),
  ]);

  // ---- Graphique : un point par jour du mois consulte --------------------
  // Tous les jours sont crees, meme sans commande : un creux doit se voir.
  const buckets = new Map();
  for (let jour = 1; jour <= nombreDeJours; jour += 1) {
    const key = cleDuJour(new Date(annee, moisIndex, jour));
    buckets.set(key, { date: key, orders: 0, revenue: 0 });
  }
  for (const order of chartOrders) {
    const bucket = buckets.get(cleDuJour(order.createdAt));
    if (bucket) {
      bucket.orders += 1;
      bucket.revenue += toNumber(order.total) || 0;
    }
  }

  // ---- Classements sur le mois consulte ---------------------------------
  const surLaPeriode = {
    restaurantId,
    createdAt: { gte: periodeDebut, lt: periodeFin },
    status: { not: 'CANCELLED' },
  };

  const topItems = await prisma.orderItem.groupBy({
    by: ['productName'],
    where: { order: surLaPeriode },
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 8,
  });

  // ---- Categories populaires --------------------------------------------
  const itemsWithCategory = await prisma.orderItem.findMany({
    where: { order: surLaPeriode },
    select: {
      quantity: true,
      lineTotal: true,
      product: { select: { category: { select: { id: true, name: true } } } },
    },
  });

  const categoryMap = new Map();
  for (const item of itemsWithCategory) {
    const name = item.product?.category?.name || 'Sans categorie';
    const entry = categoryMap.get(name) || { name, quantity: 0, revenue: 0 };
    entry.quantity += item.quantity;
    entry.revenue += toNumber(item.lineTotal) || 0;
    categoryMap.set(name, entry);
  }
  const topCategories = [...categoryMap.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 6);

  // ---- Performance des serveuses ----------------------------------------
  const serverGroups = await prisma.order.groupBy({
    by: ['serverId'],
    where: { ...surLaPeriode, serverId: { not: null } },
    _count: { _all: true },
    _sum: { total: true },
  });

  const serverIds = serverGroups.map((group) => group.serverId);
  const servers = serverIds.length
    ? await prisma.user.findMany({
        where: { id: { in: serverIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const serverById = new Map(servers.map((server) => [server.id, server]));

  const serverPerformance = serverGroups
    .map((group) => {
      const server = serverById.get(group.serverId);
      return {
        id: group.serverId,
        name: server ? `${server.firstName} ${server.lastName}` : 'Inconnue',
        orders: group._count._all,
        revenue: toNumber(group._sum.total) || 0,
      };
    })
    .sort((a, b) => b.orders - a.orders);

  // ---- Synthese du mois consulte ----------------------------------------
  const [totalCommandes, annulees, agregat] = await Promise.all([
    prisma.order.count({ where: { restaurantId, createdAt: { gte: periodeDebut, lt: periodeFin } } }),
    prisma.order.count({
      where: { restaurantId, createdAt: { gte: periodeDebut, lt: periodeFin }, status: 'CANCELLED' },
    }),
    prisma.order.aggregate({ where: surLaPeriode, _sum: { total: true }, _count: { _all: true } }),
  ]);

  const chiffreAffaires = toNumber(agregat._sum.total) || 0;
  const commandesValides = agregat._count._all || 0;
  const journees = [...buckets.values()];
  const meilleurJour = journees.reduce(
    (meilleur, jour) => (jour.revenue > (meilleur?.revenue ?? -1) ? jour : meilleur),
    null
  );

  return success(
    res,
    {
      period: {
        month: `${annee}-${String(moisIndex + 1).padStart(2, '0')}`,
        label: `${MOIS[moisIndex]} ${annee}`,
        isCurrent: moisCourant,
        orders: totalCommandes,
        cancelled: annulees,
        revenue: chiffreAffaires,
        // Panier moyen calcule sur les commandes non annulees : inclure les
        // annulations ferait baisser artificiellement la valeur.
        averageBasket: commandesValides ? Math.round(chiffreAffaires / commandesValides) : 0,
        daysWithService: journees.filter((jour) => jour.orders > 0).length,
        daysInMonth: nombreDeJours,
        bestDay: meilleurJour && meilleurJour.revenue > 0 ? meilleurJour : null,
      },
      today: {
        date: formatDate(today()),
        orders: ordersToday,
        revenue: toNumber(revenueToday._sum.total) || 0,
        pending: pendingCount,
        served: servedToday,
        activeTables,
        totalTables,
        availableProducts,
        totalProducts,
        openServiceRequests: openRequests,
        menuConfigured: Boolean(todayMenu),
        menuItemCount: todayMenu ? todayMenu._count.items : 0,
      },
      charts: {
        daily: [...buckets.values()],
        topProducts: topItems.map((item) => ({
          name: item.productName,
          quantity: item._sum.quantity || 0,
          revenue: toNumber(item._sum.lineTotal) || 0,
        })),
        topCategories,
        serverPerformance,
      },
    },
    'Statistiques recuperees'
  );
});

module.exports = { stats };
