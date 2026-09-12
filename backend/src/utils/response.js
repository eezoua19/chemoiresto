/**
 * Formats de reponse uniformes pour toute l'API.
 *   Succes : { success: true, message, data }
 *   Erreur : { success: false, message }
 */

function success(res, data = null, message = 'Operation reussie', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

function created(res, data = null, message = 'Ressource creee') {
  return success(res, data, message, 201);
}

function failure(res, message = 'Une erreur est survenue', statusCode = 400, details) {
  const payload = { success: false, message };
  if (details) payload.errors = details;
  return res.status(statusCode).json(payload);
}

module.exports = { success, created, failure };
