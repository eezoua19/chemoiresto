const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { enregistrerInstantane } = require('../services/backup.service');
const { emitToStaff } = require('../sockets');

/**
 * Remise a zero des donnees d'exploitation.
 *
 * Le geste est irreversible : trois garde-fous, et ils ne sont pas negociables.
 *
 *   1. ADMIN uniquement - une serveuse ne peut pas y toucher ;
 *   2. le nom du restaurant doit etre tape a la main - on ne remet pas une
 *      caisse a zero d'un clic distrait ;
 *   3. une sauvegarde complete est prise AVANT, et si elle echoue, rien n'est
 *      efface. C'est la regle qui compte le plus : mieux vaut une remise a
 *      zero refusee qu'une remise a zero sans filet.
 *
 * Ce qui reste debout : le restaurant et ses parametres, les comptes, la
 * carte, les tables et leurs QR Codes (les affiches collees restent valables),
 * et les sauvegardes deja prises.
 */

/** Compare deux noms sans se soucier de la casse ni des espaces en trop. */
function memeNom(saisi, attendu) {
  const nettoyer = (texte) => String(texte || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
  return nettoyer(saisi) === nettoyer(attendu) && nettoyer(attendu).length > 0;
}

/** POST /api/reset (ADMIN) */
const remiseAZero = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { confirmation, resetMenus = false } = req.body;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true },
  });
  if (!restaurant) throw ApiError.notFound('Restaurant introuvable');

  if (!memeNom(confirmation, restaurant.name)) {
    throw ApiError.badRequest(
      `Pour confirmer, saisissez exactement le nom du restaurant : « ${restaurant.name} »`
    );
  }

  // ---- Le filet, avant tout le reste --------------------------------------
  const sauvegarde = await enregistrerInstantane(restaurantId, 'AVANT_RAZ');
  if (!sauvegarde.ok) {
    throw ApiError.internal(
      `Remise à zéro annulée : la sauvegarde préalable a échoué (${sauvegarde.erreur}). Aucune donnée n'a été touchée.`
    );
  }

  // ---- La suppression, en une seule transaction ---------------------------
  // Tout ou rien : une remise a zero interrompue au milieu laisserait des
  // commandes sans lignes et des chiffres qui ne veulent plus rien dire.
  const parRestaurant = { where: { restaurantId } };
  const parCommande = { where: { order: { restaurantId } } };

  const efface = await prisma.$transaction(async (tx) => {
    const compte = {};
    compte.orderItemOptions = (
      await tx.orderItemOption.deleteMany({ where: { orderItem: { order: { restaurantId } } } })
    ).count;
    compte.orderItems = (await tx.orderItem.deleteMany(parCommande)).count;
    compte.orderStatusHistory = (await tx.orderStatusHistory.deleteMany(parCommande)).count;
    compte.subscriptionUsages = (await tx.subscriptionUsage.deleteMany(parRestaurant)).count;
    compte.orders = (await tx.order.deleteMany(parRestaurant)).count;
    compte.serviceRequests = (await tx.serviceRequest.deleteMany(parRestaurant)).count;
    compte.subscriptions = (await tx.subscription.deleteMany(parRestaurant)).count;
    compte.notifications = (await tx.notification.deleteMany(parRestaurant)).count;
    compte.customers = (await tx.customer.deleteMany(parRestaurant)).count;
    compte.closings = (await tx.dailyClosing.deleteMany(parRestaurant)).count;
    compte.auditLogs = (await tx.auditLog.deleteMany(parRestaurant)).count;

    if (resetMenus) {
      compte.dailyMenuItems = (
        await tx.dailyMenuItem.deleteMany({ where: { dailyMenu: { restaurantId } } })
      ).count;
      compte.dailyMenus = (await tx.dailyMenu.deleteMany(parRestaurant)).count;
    }

    return compte;
  });

  // Les ecrans ouverts en salle affichent encore des commandes qui n'existent
  // plus : on les previent au lieu de les laisser dans le vide.
  emitToStaff(restaurantId, 'data_reset', { at: new Date().toISOString(), resetMenus });

  const total = Object.values(efface).reduce((somme, nombre) => somme + nombre, 0);

  return success(
    res,
    {
      deleted: efface,
      total,
      backup: {
        id: sauvegarde.snapshot.id,
        sizeBytes: sauvegarde.snapshot.sizeBytes,
        createdAt: sauvegarde.snapshot.createdAt,
      },
      resetMenus,
    },
    `Remise à zéro effectuée : ${total} ligne${total > 1 ? 's' : ''} effacée${
      total > 1 ? 's' : ''
    }. Une sauvegarde a été conservée.`
  );
});

module.exports = { remiseAZero };
