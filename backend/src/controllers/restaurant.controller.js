const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');

/** GET /api/restaurant */
const detail = asyncHandler(async (req, res) => {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: req.user.restaurantId },
  });
  return success(res, restaurant, 'Parametres du restaurant recuperes');
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

  return success(res, restaurant, 'Parametres enregistres');
});

module.exports = { detail, update };
