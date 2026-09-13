import { useEffect, useState } from 'react';
import useReducedMotion from './useReducedMotion';

/**
 * Garde un élément monté le temps qu'il sorte de l'écran.
 *
 * Sans cela, `if (!open) return null` retire le panneau du document à
 * l'instant même : il monte élégamment en 280 ms et disparaît en 0. C'est ce
 * détail-là, plus que l'entrée, qui fait la différence entre une page web et
 * une application.
 *
 * Renvoie `monte` (faut-il afficher quelque chose) et `sortant` (faut-il
 * jouer l'animation de sortie).
 */
export default function usePresence(open, duree = 220) {
  const reduit = useReducedMotion();
  const [monte, setMonte] = useState(open);

  useEffect(() => {
    if (open) {
      setMonte(true);
      return undefined;
    }
    if (!monte) return undefined;

    // Animations coupées : rien à attendre, on retire tout de suite.
    if (reduit) {
      setMonte(false);
      return undefined;
    }

    const minuteur = setTimeout(() => setMonte(false), duree);
    return () => clearTimeout(minuteur);
  }, [open, monte, duree, reduit]);

  return { monte, sortant: monte && !open };
}
