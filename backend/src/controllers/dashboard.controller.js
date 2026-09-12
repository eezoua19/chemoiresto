const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { dayRange, toNumber, today, formatDate } = require('../utils/helpers');

/**
 * GET /api/dashboard/stats
 * Indicateurs du jour + graphiques (14 derniers jours, top produits,
 * categories populaires, performance des serveuses).
 */
const stats = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { start: todayStart, end: todayEnd } = dayRange(new Date());

  const daysBack = 14;
  const chartStart = new Date(todayStart);
  chartStart.setDate(chartStart.getDate() - (daysBack - 1));

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
      where: { restaurantId, createdAt: { gte: chartStart }, status: { not: 'CANCELLED' } },
      select: { createdAt: true, total: true },
    }),
    prisma.dailyMenu.findUnique({
      where: { restaurantId_date: { restaurantId, date: today() } },
      include: { _count: { select: { items: true } } },
    }),
  ]);

  // ---- Graphique : commandes et chiffre d'affaires par jour --------------
  const buckets = new Map();
  for (let i = 0; i < daysBack; i += 1) {
    const day = new Date(chartStart);
    day.setDate(day.getDate() + i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
      day.getDate()
    ).padStart(2, '0')}`;
    buckets.set(key, { date: key, orders: 0, revenue: 0 });
  }
  for (const order of chartOrders) {
    const d = order.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.orders += 1;
      bucket.revenue += toNumber(order.total) || 0;
    }
  }

  // ---- Top produits (30 derniers jours) ---------------------------------
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 29);

  const topItems = await prisma.orderItem.groupBy({
    by: ['productName'],
    where: { order: { restaurantId, createdAt: { gte: monthStart }, status: { not: 'CANCELLED' } } },
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 8,
  });

  // ---- Categories populaires --------------------------------------------
  const itemsWithCategory = await prisma.orderItem.findMany({
    where: { order: { restaurantId, createdAt: { gte: monthStart }, status: { not: 'CANCELLED' } } },
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
    where: {
      restaurantId,
      createdAt: { gte: monthStart },
      status: { not: 'CANCELLED' },
      serverId: { not: null },
    },
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

  return success(
    res,
    {
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
