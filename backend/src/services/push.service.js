const webpush = require('web-push');
const prisma = require('../config/prisma');
const env = require('../config/env');

const configured = Boolean(env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject);

if (configured) {
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
} else {
  console.warn(
    '[PUSH] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT absents : notifications push désactivées.'
  );
}

/**
 * Envoie une notification push à un utilisateur precis, ou a tout le
 * personnel d'un restaurant. Miroir cote transport de emitToUser/emitToStaff
 * (sockets/index.js) : meme ciblage, mais recu meme onglet ferme.
 *
 * Un abonnement expire ou revoque (404/410) est silencieusement supprime :
 * c'est le comportement standard de l'API Web Push, pas une erreur a
 * remonter au client qui a declenche l'evenement.
 */
async function sendPush({ restaurantId, userId = null, payload }) {
  if (!configured) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: userId ? { userId } : { restaurantId },
  });
  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error('[PUSH] envoi échoué :', error.message);
        }
      }
    })
  );
}

module.exports = { sendPush, isConfigured: () => configured };
