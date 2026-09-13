import { useEffect, useState } from 'react';

const REQUETE = '(prefers-reduced-motion: reduce)';

/**
 * Le système signale-t-il qu'il faut limiter les animations ?
 *
 * Le CSS s'en charge déjà pour l'apparence (voir index.css). Ce crochet sert
 * au JavaScript qui doit prendre la même décision : attendre la fin d'une
 * animation de sortie n'a aucun sens si cette animation est instantanée.
 */
export default function useReducedMotion() {
  const [reduit, setReduit] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(REQUETE).matches === true
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const media = window.matchMedia(REQUETE);
    const surChangement = (evenement) => setReduit(evenement.matches);
    setReduit(media.matches);

    // Safari n'a adopte addEventListener sur les media queries que tardivement.
    if (media.addEventListener) {
      media.addEventListener('change', surChangement);
      return () => media.removeEventListener('change', surChangement);
    }
    media.addListener(surChangement);
    return () => media.removeListener(surChangement);
  }, []);

  return reduit;
}
