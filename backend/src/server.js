const http = require('http');
const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/prisma');
const { initSocket } = require('./sockets');
const planificateur = require('./services/planificateur');

const server = http.createServer(app);
initSocket(server);

async function start() {
  try {
    await prisma.$connect();
    // eslint-disable-next-line no-console
    console.log('[OK] Base de données connectée');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[ERREUR] Connexion à la base de données impossible :', error.message);
    console.error('       Vérifiez que MySQL est démarré et que DATABASE_URL est correcte.');
    process.exit(1);
  }

  // Cloture de la veille et sauvegarde complete, chaque nuit a 3 h.
  planificateur.demarrer();

  // 0.0.0.0 explicite : en conteneur, écouter sur la boucle locale rend le
  // service injoignable depuis le proxy de l'hebergeur (healthcheck en échec
  // alors que le processus tourne).
  server.listen(env.port, '0.0.0.0', () => {
    const bound = server.address();
    // eslint-disable-next-line no-console
    console.log(`[OK] API à l'écoute sur ${bound.address}:${bound.port}`);
    console.log(`[OK] Socket.IO actif - frontend autorisé : ${env.frontendUrl}`);
  });

  server.on('error', (error) => {
    // eslint-disable-next-line no-console
    console.error(`[ERREUR] Impossible d'écouter sur le port ${env.port} :`, error.message);
    process.exit(1);
  });
}

/**
 * Filet de securite : une erreur non geree qui echappe a `asyncHandler` ne
 * doit pas laisser le process tourner dans un etat incertain (connexion DB a
 * moitie rompue, timers orphelins...). On log bruyamment puis on sort
 * proprement - Railway relance seul (`restartPolicyType: ON_FAILURE`, voir
 * railway.json), une erreur localisee redevient donc un simple redemarrage
 * au lieu d'un service qui repond n'importe quoi sans que personne ne le
 * sache.
 *
 * Enregistrer ces handlers change le comportement par defaut de Node : sans
 * eux, une promesse rejetee sans .catch() fait deja planter le process
 * (Node >= 15). Avec eux, c'est nous qui devons declencher la sortie -
 * sinon le process resterait vivant dans un etat casse, silencieusement.
 */
function crashSafely(origine, error) {
  // eslint-disable-next-line no-console
  console.error(`[FATAL] ${origine} :`, error);
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('unhandledRejection', (error) => crashSafely('Promesse rejetée sans gestion', error));
process.on('uncaughtException', (error) => crashSafely('Exception non interceptée', error));

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} reçu, arrêt du serveur...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();

module.exports = server;
