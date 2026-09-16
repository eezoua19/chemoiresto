import { useEffect } from 'react';
import { pushApi } from '../services/endpoints';
import { PUSH_SUPPORTED, VAPID_PUBLIC_KEY, base64ToUint8Array } from '../utils/push';

/**
 * Active automatiquement les notifications push pour le client qui suit une
 * commande - pas de bouton, contrairement au personnel (PushSubscribeToggle) :
 * le client n'ouvre cette page qu'une fois, souvent pour refermer l'onglet
 * juste après avoir commandé, donc c'est le seul moment où on peut lui
 * proposer de rester informé même l'app fermée.
 *
 * Best-effort et silencieux : si le navigateur ne supporte pas l'API, si la
 * permission est refusée, ou si l'abonnement échoue, le suivi reste
 * disponible via Socket.IO (onglet ouvert) sans que l'utilisateur voie rien.
 */
export default function useClientPushSubscription(trackingToken) {
  useEffect(() => {
    if (!PUSH_SUPPORTED || !trackingToken) return;
    if (Notification.permission === 'denied') return;

    let annule = false;

    (async () => {
      try {
        let permission = Notification.permission;
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }
        if (annule || permission !== 'granted') return;

        const registration = await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ||
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64ToUint8Array(VAPID_PUBLIC_KEY),
          }));

        if (annule) return;
        await pushApi.subscribeClient(trackingToken, subscription.toJSON());
      } catch {
        // Best-effort silencieux : voir le commentaire en tête de fichier.
      }
    })();

    return () => {
      annule = true;
    };
  }, [trackingToken]);
}
