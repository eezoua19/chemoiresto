const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { today, formatDate } = require('../utils/helpers');

/**
 * Contrôle de mise en service.
 *
 * Réunit en un seul endroit les quelques choses qui empêchent un client de
 * commander, ou qui font mauvaise impression. Ce ne sont pas des erreurs
 * techniques — l'application tourne parfaitement — ce sont des oublis de
 * configuration, et ils sont invisibles depuis le bureau : c'est le client,
 * QR Code en main, qui les découvre.
 *
 * Trois niveaux, et l'ordre compte :
 *   bloquant  — un client ne peut pas commander maintenant ;
 *   attention — ça marche, mais ça fait amateur ou ça expose à une perte ;
 *   info      — bon à savoir, rien à réparer.
 */

/** Un numéro de démonstration : que des zéros après l'indicatif. */
function telephoneDeDemonstration(numero) {
  if (!numero) return false;
  const chiffres = String(numero).replace(/\D/g, '');
  if (chiffres.length < 8) return false;
  // On ignore l'indicatif pays éventuel avant de juger.
  const local = chiffres.replace(/^225/, '');
  return /^0*$/.test(local.slice(2)) || /(\d)\1{6,}/.test(local);
}

/** GET /api/setup (ADMIN) */
const controles = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const date = today();

  const [restaurant, menu, tables, produitsDisponibles, produitsTotal, serveuses, sauvegarde] =
    await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { name: true, phone: true, address: true, logo: true, takeawayEnabled: true },
      }),
      prisma.dailyMenu.findFirst({
        where: { restaurantId, date },
        include: { _count: { select: { items: true } } },
      }),
      prisma.restaurantTable.findMany({
        where: { restaurantId },
        select: { id: true, number: true, status: true },
        orderBy: { number: 'asc' },
      }),
      prisma.product.count({ where: { restaurantId, isActive: true, isAvailable: true } }),
      prisma.product.count({ where: { restaurantId, isActive: true } }),
      prisma.user.count({ where: { restaurantId, role: 'SERVER', status: 'ACTIVE' } }),
      prisma.backupSnapshot.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

  const inactives = tables.filter((table) => table.status === 'INACTIVE');
  const heuresDepuisSauvegarde = sauvegarde
    ? Math.floor((Date.now() - sauvegarde.createdAt.getTime()) / 3600000)
    : null;

  const controlesEffectues = [
    {
      id: 'menu_du_jour',
      titre: 'Menu du jour',
      ok: Boolean(menu && menu.isPublished && menu._count.items > 0),
      niveau: 'bloquant',
      detail:
        menu && menu.isPublished && menu._count.items > 0
          ? `${menu._count.items} plat${menu._count.items > 1 ? 's' : ''} à la carte aujourd'hui`
          : menu && !menu.isPublished
            ? "Le menu d'aujourd'hui existe mais n'est pas publié : les clients ne le voient pas."
            : "Aucun menu pour aujourd'hui. Un client qui scanne son QR Code ne peut rien commander.",
      action: { label: 'Composer le menu du jour', route: `/admin/menus/${formatDate(date)}` },
    },
    {
      id: 'plats_disponibles',
      titre: 'Plats disponibles',
      ok: produitsDisponibles > 0,
      niveau: 'bloquant',
      detail:
        produitsDisponibles > 0
          ? `${produitsDisponibles} plat${produitsDisponibles > 1 ? 's' : ''} disponible${
              produitsDisponibles > 1 ? 's' : ''
            } sur ${produitsTotal}`
          : 'Tous vos plats sont en rupture ou désactivés.',
      action: { label: 'Voir la carte', route: '/admin/produits' },
    },
    {
      id: 'tables_actives',
      titre: 'Tables en service',
      ok: inactives.length === 0,
      niveau: 'bloquant',
      detail:
        inactives.length === 0
          ? `${tables.length} table${tables.length > 1 ? 's' : ''} en service`
          : `${inactives.length} table${inactives.length > 1 ? 's' : ''} désactivée${
              inactives.length > 1 ? 's' : ''
            } : ${inactives.map((table) => table.number).join(', ')}. Leur QR Code refuse les clients.`,
      // De quoi tout réactiver d'un geste, sans parcourir la liste.
      cibles: inactives.map((table) => ({ id: table.id, number: table.number })),
      action: { label: 'Gérer les tables', route: '/admin/tables' },
    },
    {
      id: 'telephone',
      titre: 'Numéro de téléphone',
      ok: Boolean(restaurant?.phone) && !telephoneDeDemonstration(restaurant.phone),
      niveau: 'attention',
      detail: !restaurant?.phone
        ? 'Aucun numéro affiché sur le menu des clients.'
        : telephoneDeDemonstration(restaurant.phone)
          ? `« ${restaurant.phone} » ressemble à un numéro de démonstration. Il s'affiche en haut de chaque menu.`
          : restaurant.phone,
      action: { label: 'Corriger', route: '/admin/parametres' },
    },
    {
      id: 'adresse',
      titre: 'Adresse',
      ok: Boolean(restaurant?.address),
      niveau: 'attention',
      detail: restaurant?.address || "Aucune adresse : le client à emporter ne sait pas où venir.",
      action: { label: 'Renseigner', route: '/admin/parametres' },
    },
    {
      id: 'sauvegarde',
      titre: 'Sauvegarde',
      ok: heuresDepuisSauvegarde !== null && heuresDepuisSauvegarde <= 30,
      niveau: 'attention',
      detail:
        heuresDepuisSauvegarde === null
          ? "Aucune sauvegarde n'a encore été prise."
          : heuresDepuisSauvegarde <= 30
            ? `Dernière sauvegarde il y a ${heuresDepuisSauvegarde} h`
            : `Dernière sauvegarde il y a ${heuresDepuisSauvegarde} h : quelque chose ne tourne plus.`,
      action: { label: 'Voir les sauvegardes', route: '/admin/sauvegardes' },
    },
    {
      id: 'serveuses',
      titre: 'Comptes du personnel',
      ok: serveuses > 0,
      niveau: 'attention',
      detail:
        serveuses > 0
          ? `${serveuses} serveuse${serveuses > 1 ? 's' : ''} active${serveuses > 1 ? 's' : ''}`
          : 'Aucun compte serveuse : personne ne recevra les commandes en salle.',
      action: { label: 'Créer un compte', route: '/admin/serveuses' },
    },
    {
      id: 'logo',
      titre: 'Logo',
      ok: Boolean(restaurant?.logo),
      niveau: 'info',
      detail: restaurant?.logo
        ? 'Affiché en haut du menu'
        : 'Sans logo, ce sont vos initiales qui sont affichées.',
      action: { label: 'Ajouter un logo', route: '/admin/parametres' },
    },
  ];

  const bloquants = controlesEffectues.filter((c) => !c.ok && c.niveau === 'bloquant');
  const attentions = controlesEffectues.filter((c) => !c.ok && c.niveau === 'attention');

  return success(
    res,
    {
      date: formatDate(date),
      checks: controlesEffectues,
      // Le resume que l'interface affiche sans avoir a recompter.
      summary: {
        blocking: bloquants.length,
        warnings: attentions.length,
        // « Prêt » veut dire : un client peut scanner et commander maintenant.
        ready: bloquants.length === 0,
      },
    },
    'Contrôle de mise en service'
  );
});

/**
 * POST /api/setup/tables/activate (ADMIN)
 * Remet toutes les tables en service d'un geste.
 */
const activerLesTables = asyncHandler(async (req, res) => {
  const { count } = await prisma.restaurantTable.updateMany({
    where: { restaurantId: req.user.restaurantId, status: 'INACTIVE' },
    data: { status: 'ACTIVE' },
  });

  return success(
    res,
    { activated: count },
    count === 0
      ? 'Toutes les tables étaient déjà en service'
      : `${count} table${count > 1 ? 's' : ''} remise${count > 1 ? 's' : ''} en service`
  );
});

module.exports = { controles, activerLesTables };
