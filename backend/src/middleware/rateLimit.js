const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const message = { success: false, message: 'Trop de requetes, veuillez patienter un instant' };

/** Limite globale, large, pour proteger l'API. */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.isProduction ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

/** Limite stricte sur la connexion pour ralentir les attaques par force brute. */
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: env.isProduction ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Trop de tentatives de connexion. Reessayez dans 10 minutes.' },
});

/** Limite les creations de commandes depuis une meme adresse. */
const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.isProduction ? 12 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Vous commandez trop vite. Patientez quelques secondes.' },
});

/** Anti-spam sur les appels serveuse / demandes d'addition. */
const serviceRequestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.isProduction ? 6 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Votre demande a deja ete envoyee. Patientez un instant.' },
});

module.exports = { globalLimiter, loginLimiter, orderLimiter, serviceRequestLimiter };
