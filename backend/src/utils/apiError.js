/**
 * Erreur applicative transportant un code HTTP.
 * Toutes les erreurs metier du projet passent par cette classe afin que le
 * middleware central puisse repondre au format standard { success, message }.
 */
class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Requête invalide', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Authentification requise') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Accès refusé') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Ressource introuvable') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflit avec une ressource existante') {
    return new ApiError(409, message);
  }

  static tooMany(message = 'Trop de requetes, réessayez plus tard') {
    return new ApiError(429, message);
  }

  static internal(message = 'Une erreur interne est survenue') {
    return new ApiError(500, message);
  }
}

module.exports = ApiError;
