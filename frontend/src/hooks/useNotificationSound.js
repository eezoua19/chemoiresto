import { useCallback, useRef } from 'react';

/**
 * Signal sonore génère via l'API Web Audio : aucun fichier externe requis.
 * Les navigateurs exigent une interaction utilisateur avant de jouer un son ;
 * l'AudioContext est donc créé au premier appel et repris s'il est suspendu.
 */
export default function useNotificationSound() {
  const contextRef = useRef(null);

  return useCallback((variant = 'order') => {
    try {
      if (!contextRef.current) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return;
        contextRef.current = new AudioCtor();
      }

      const context = contextRef.current;
      if (context.state === 'suspended') context.resume();

      // "tac" a son propre enveloppe, plus courte et plus discrete que les
      // autres : c'est le seul son qui peut se repeter tres vite (un ajout au
      // panier apres l'autre), une phrase de deux notes deviendrait fatigante.
      if (variant === 'tac') {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.value = 1200;
        const start = context.currentTime;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.08);
        return;
      }

      // Trois timbres distincts : aigu et montant pour une nouvelle commande,
      // medium pour un appel, deux notes identiques (un "bip-bip" plat, pas une
      // phrase melodique) pour une rupture - volontairement moins agreable,
      // c'est une alerte de gestion, pas une bonne nouvelle.
      const notes =
        variant === 'order' ? [880, 1174] : variant === 'rupture' ? [494, 494] : [660, 880];

      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;

        const start = context.currentTime + index * 0.16;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.32);
      });
    } catch {
      // Son indisponible : l'application continue de fonctionner normalement.
    }
  }, []);
}
