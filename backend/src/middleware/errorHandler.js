const { Prisma } = require('@prisma/client');
const env = require('../config/env');
const ApiError = require('../utils/apiError');
const { failure } = require('../utils/response');

/** Route inconnue -> 404 au format standard. */
function notFoundHandler(req, res) {
  return failure(res, `Route introuvable : ${req.method} ${req.originalUrl}`, 404);
}

/** Gestion centralisee des erreurs. */
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, _next) {
  // Erreurs metier explicites
  if (error instanceof ApiError) {
    return failure(res, error.message, error.statusCode, error.details);
  }

  // Erreurs Prisma connues -> messages lisibles
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const fields = Array.isArray(error.meta?.target)
        ? error.meta.target.join(', ')
        : error.meta?.target || 'champ unique';
      return failure(res, `Cette valeur existe deja (${fields})`, 409);
    }
    if (error.code === 'P2025') {
      return failure(res, 'Ressource introuvable', 404);
    }
    if (error.code === 'P2003') {
      return failure(res, 'Impossible : cet element est utilise ailleurs', 409);
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return failure(res, 'Donnees invalides pour la base de donnees', 400);
  }

  // Erreurs Multer (upload)
  if (error.code === 'LIMIT_FILE_SIZE') {
    return failure(res, `Fichier trop volumineux (max ${env.maxUploadSizeMb} Mo)`, 400);
  }

  if (error.type === 'entity.parse.failed') {
    return failure(res, 'Corps de requete JSON invalide', 400);
  }

  // Erreur inattendue
  // eslint-disable-next-line no-console
  console.error('[ERREUR NON GEREE]', error);
  return failure(
    res,
    env.isProduction ? 'Une erreur interne est survenue' : error.message,
    500
  );
}

module.exports = { errorHandler, notFoundHandler };
