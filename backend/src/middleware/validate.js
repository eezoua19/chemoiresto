const ApiError = require('../utils/apiError');

/**
 * Middleware de validation Zod.
 * Valide et remplace req.body / req.query / req.params par les données
 * nettoyees (types convertis, champs inconnus retires).
 *
 *   router.post('/', validate({ body: createProductSchema }), controller)
 */
function validate(schemas) {
  return (req, _res, next) => {
    try {
      for (const key of ['body', 'query', 'params']) {
        if (!schemas[key]) continue;
        const result = schemas[key].safeParse(req[key]);
        if (!result.success) {
          const details = result.error.issues.map((issue) => ({
            field: issue.path.join('.') || key,
            message: issue.message,
          }));
          throw ApiError.badRequest('Données invalides', details);
        }
        // req.query est en lecture seule sur Express 5 : on assigne proprement.
        if (key === 'query') {
          Object.defineProperty(req, 'query', { value: result.data, writable: true });
        } else {
          req[key] = result.data;
        }
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = validate;
