const http = require('http');
const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/prisma');
const { initSocket } = require('./sockets');

const server = http.createServer(app);
initSocket(server);

async function start() {
  try {
    await prisma.$connect();
    // eslint-disable-next-line no-console
    console.log('[OK] Base de donnees connectee');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[ERREUR] Connexion a la base de donnees impossible :', error.message);
    console.error('       Verifiez que MySQL est demarre et que DATABASE_URL est correcte.');
    process.exit(1);
  }

  // 0.0.0.0 explicite : en conteneur, ecouter sur la boucle locale rend le
  // service injoignable depuis le proxy de l'hebergeur (healthcheck en echec
  // alors que le processus tourne).
  server.listen(env.port, '0.0.0.0', () => {
    const bound = server.address();
    // eslint-disable-next-line no-console
    console.log(`[OK] API a l'ecoute sur ${bound.address}:${bound.port}`);
    console.log(`[OK] Socket.IO actif - frontend autorise : ${env.frontendUrl}`);
  });

  server.on('error', (error) => {
    // eslint-disable-next-line no-console
    console.error(`[ERREUR] Impossible d'ecouter sur le port ${env.port} :`, error.message);
    process.exit(1);
  });
}

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} recu, arret du serveur...`);
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
