/**
 * Enrobe un controleur asynchrone pour transmettre automatiquement les
 * rejets de promesse au middleware d'erreurs central.
 */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
