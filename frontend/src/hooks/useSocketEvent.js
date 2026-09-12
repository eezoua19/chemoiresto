import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getSocket, getSocketVersion, subscribeToSocketChanges } from '../services/socket';

/**
 * Abonne un composant a un evenement Socket.IO et se desabonne proprement.
 * Le gestionnaire est stocke dans une ref : pas besoin de le memoiser.
 * L'abonnement est recree si la connexion elle-meme est remplacee
 * (connexion, deconnexion, changement de compte).
 */
export default function useSocketEvent(event, handler, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const version = useSyncExternalStore(subscribeToSocketChanges, getSocketVersion, getSocketVersion);

  useEffect(() => {
    if (!enabled || !event) return undefined;

    const socket = getSocket();
    const listener = (...args) => handlerRef.current(...args);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [event, enabled, version]);
}
