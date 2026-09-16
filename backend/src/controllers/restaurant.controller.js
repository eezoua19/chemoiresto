const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { randomToken } = require('../utils/helpers');
const { buildTakeawayUrl, renderUrl } = require('../services/qrcode.service');

/**
 * Ce que le personnel doit savoir de la vente à emporter : si elle est
 * ouverte, et par quelle adresse le client y accède. L'URL et le QR Code ne
 * sont calcules que quand un jeton existe.
 */
async function blocEmporter(restaurant) {
  if (!restaurant.takeawayToken) {
    return { enabled: restaurant.takeawayEnabled, url: null, qrDataUrl: null };
  }
  const url = buildTakeawayUrl(restaurant.takeawayToken);
  return { enabled: restaurant.takeawayEnabled, url, qrDataUrl: await renderUrl(url) };
}

/** GET /api/restaurant */
const detail = asyncHandler(async (req, res) => {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: req.user.restaurantId },
  });
  return success(
    res,
    { ...restaurant, takeaway: await blocEmporter(restaurant) },
    'Paramètres du restaurant récupérés'
  );
});

/**
 * PATCH /api/restaurant/emporter
 *
 * Ouvre ou ferme la vente à emporter. Le jeton est crée à la première
 * ouverture et conserve ensuite : refermer puis rouvrir ne doit pas
 * invalider l'affiche déjà imprimee et posee au comptoir.
 */
const setTakeaway = asyncHandler(async (req, res) => {
  const { enabled, regenerate } = req.body;

  const current = await prisma.restaurant.findUnique({
    where: { id: req.user.restaurantId },
  });

  const data = { takeawayEnabled: enabled };
  if (regenerate || (enabled && !current.takeawayToken)) {
    data.takeawayToken = randomToken(16);
  }

  const restaurant = await prisma.restaurant.update({
    where: { id: req.user.restaurantId },
    data,
  });

  return success(
    res,
    { ...restaurant, takeaway: await blocEmporter(restaurant) },
    enabled ? 'Vente à emporter ouverte' : 'Vente à emporter fermée'
  );
});

/** PUT /api/restaurant (multipart : champ "logo" optionnel) */
const update = asyncHandler(async (req, res) => {
  const data = {};
  const fields = [
    'name',
    'description',
    'address',
    'phone',
    'email',
    'currency',
    'openingHours',
    'primaryColor',
    'welcomeMessage',
    'loyaltyEnabled',
    'loyaltyRewardThreshold',
    'loyaltyRewardLabel',
  ];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      data[field] = req.body[field] === '' ? null : req.body[field];
    }
  }

  if (req.file) data.logo = `/uploads/products/${req.file.filename}`;

  const restaurant = await prisma.restaurant.update({
    where: { id: req.user.restaurantId },
    data,
  });

  return success(
    res,
    { ...restaurant, takeaway: await blocEmporter(restaurant) },
    'Paramètres enregistrés'
  );
});

module.exports = { detail, update, setTakeaway };
