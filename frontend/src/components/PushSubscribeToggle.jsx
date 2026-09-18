import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { pushApi } from '../services/endpoints';
import { useToast } from '../context/ToastContext';
import { PUSH_SUPPORTED as SUPPORTED, VAPID_PUBLIC_KEY, base64ToUint8Array } from '../utils/push';

/**
 * Bouton "Activer les notifications" à côté de la cloche in-app.
 *
 * La cloche existante (NotificationBell) ne fonctionne que l'onglet ouvert.
 * Ceci est le second canal : recu meme onglet fermé, tant que le navigateur
 * tourne. Invisible si le navigateur ne supporte pas l'API, ou si le serveur
 * n'a pas de clé VAPID configurée (VAPID_PUBLIC_KEY absente côté backend).
 */
export default function PushSubscribeToggle() {
  const toast = useToast();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!SUPPORTED) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {});
  }, []);

  if (!SUPPORTED) return null;

  const activer = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.warning('Autorisation refusée : activez les notifications dans les réglages du navigateur.');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      await pushApi.subscribe(subscription.toJSON());
      setSubscribed(true);
      toast.success('Notifications activées sur cet appareil');
    } catch (err) {
      toast.error(err.message || 'Activation impossible');
    } finally {
      setBusy(false);
    }
  };

  const desactiver = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await pushApi.unsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      toast.success('Notifications désactivées sur cet appareil');
    } catch (err) {
      toast.error(err.message || 'Désactivation impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={subscribed ? desactiver : activer}
      disabled={busy}
      className="rounded-xl p-2.5 text-ink-500 dark:text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-700 disabled:opacity-50"
      title={subscribed ? 'Désactiver les notifications push' : 'Activer les notifications push'}
      aria-label={subscribed ? 'Désactiver les notifications push' : 'Activer les notifications push'}
    >
      {subscribed ? <Bell size={18} className="text-brand" /> : <BellOff size={18} />}
    </button>
  );
}
