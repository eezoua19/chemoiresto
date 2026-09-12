const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');

function publicUser(user) {
  return {
    id: user.id,
    restaurantId: user.restaurantId,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
  };
}

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { restaurant: { select: { id: true, name: true, slug: true, currency: true, logo: true, primaryColor: true } } },
  });

  // Message volontairement identique pour ne pas reveler l'existence du compte.
  if (!user) throw ApiError.unauthorized('Email ou mot de passe incorrect');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw ApiError.unauthorized('Email ou mot de passe incorrect');

  if (user.status !== 'ACTIVE') throw ApiError.forbidden('Ce compte est desactive');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = jwt.sign({ sub: user.id, role: user.role, rid: user.restaurantId }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

  return success(
    res,
    { token, user: publicUser(user), restaurant: user.restaurant },
    'Connexion reussie'
  );
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: req.user.restaurantId },
    select: { id: true, name: true, slug: true, currency: true, logo: true, primaryColor: true },
  });
  return success(res, { user: publicUser(req.user), restaurant }, 'Profil recupere');
});

/**
 * POST /api/auth/logout
 * Les JWT sont sans etat : la deconnexion se fait cote client en supprimant le
 * jeton. Cette route existe pour tracer l'action et uniformiser le contrat API.
 */
const logout = asyncHandler(async (_req, res) => success(res, null, 'Deconnexion reussie'));

module.exports = { login, me, logout, publicUser };
