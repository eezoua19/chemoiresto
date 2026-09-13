import { useEffect, useSyncExternalStore } from 'react';
import { getSocket, getSocketVersion, subscribeToSocketChanges } from '../services/socket';

/**
 * Maintient l'inscription à un salon temps réel, quoi qu'il arrive à la
 * connexion.
 *
 * Le piège qu'il ferme : une page enfant qui s'inscrivait à son salon pouvait
 * voir sa connexion remplacée juste après, par un effet situé plus haut dans
 * l'arbre (React exécute les effets des enfants AVANT ceux des parents). La
 * demande d'inscription partait alors sur une connexion déjà condamnée, et la
 * page restait muette sans que rien ne le signale — un suivi de commande qui
 * n'avance jamais, sans la moindre erreur à l'écran.
 *
 * Ici, l'inscription est rejouée à chaque changement de connexion et à chaque
 * reconnexion. Peu importe qui remplace la connexion, et dans quel ordre.
 */
export default function useSocketRoom(evenementEntrer, jeton, evenementSortir = null) {
  // Change à chaque remplacement de la connexion : c'est ce qui déclenche la
  // réinscription.
  const version = useSyncExternalStore(
    subscribeToSocketChanges,
    getSocketVersion,
    getSocketVersion
  );

  useEffect(() => {
    if (!evenementEntrer || !jeton) return undefined;

    const socket = getSocket();
    const entrer = () => socket.emit(evenementEntrer, jeton);

    entrer();
    socket.on('connect', entrer);

    return () => {
      socket.off('connect', entrer);
      // Sortir d'un salon sur une connexion déjà fermée n'a aucun sens, et
      // socket.io mettrait l'ordre en file pour la prochaine connexion.
      if (evenementSortir && socket.connected) socket.emit(evenementSortir, jeton);
    };
  }, [evenementEntrer, evenementSortir, jeton, version]);
}
