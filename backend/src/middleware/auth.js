const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');

/** Extrait le jeton "Bearer xxx" de l'en-tete Authorization. */
function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Vérifie le JWT, recharge l'utilisateur en base et le place sur req.user.
 * Recharger l'utilisateur permet de bloquer immédiatement un compte désactivé
 * même si son jeton n'a pas encore expire.
 */
const authMiddleware = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Jeton d\'authentification manquant');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    throw ApiError.unauthorized('Session expirée ou jeton invalide');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      restaurantId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      status: true,
    },
  });

  if (!user) throw ApiError.unauthorized('Compte introuvable');
  if (user.status !== 'ACTIVE') throw ApiError.forbidden('Ce compte est désactivé');

  req.user = user;
  return next();
});

/**
 * Restreint l'accès à une liste de roles.
 * Exemple : router.use(roleMiddleware('ADMIN'))
 */
function roleMiddleware(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('Vous n\'avez pas les droits nécessaires'));
    }
    return next();
  };
}

module.exports = { authMiddleware, roleMiddleware, extractToken };
