import { useEffect, useMemo, useState } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

const COULEURS = ['#E4572E', '#F0A202', '#0E7C66', '#2563EB', '#FFFFFF'];
const NOMBRE = 22;
const DUREE = 1700;

/**
 * Une gerbe de confettis, pour le seul moment vraiment heureux du parcours :
 * « votre plat est prêt ».
 *
 * Vingt-deux petits carrés, trajectoires tirées une fois pour toutes au
 * montage, animés en `transform` et `opacity` uniquement. Pas de toile, pas de
 * boucle de rendu, pas de bibliothèque : le navigateur s'en occupe sur la
 * carte graphique et le fil principal reste libre.
 *
 * Se retire tout seul au bout de la fête. Et ne se déclenche pas du tout si le
 * téléphone demande de limiter les animations — une gerbe de particules est
 * exactement ce que ce réglage cherche à éviter.
 */
export default function Confettis({ actif }) {
  const reduit = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!actif || reduit) return undefined;
    setVisible(true);
    const minuteur = setTimeout(() => setVisible(false), DUREE + 200);
    return () => clearTimeout(minuteur);
  }, [actif, reduit]);

  // Tirées une seule fois : re-tirer à chaque rendu ferait sauter les
  // trajectoires en cours de vol.
  const grains = useMemo(
    () =>
      Array.from({ length: NOMBRE }, (_, index) => {
        const angle = (index / NOMBRE) * Math.PI * 2 + Math.random() * 0.4;
        const distance = 90 + Math.random() * 120;
        return {
          id: index,
          x: Math.cos(angle) * distance,
          // Vers le haut d'abord : la gravité les rattrape ensuite.
          y: Math.sin(angle) * distance - 40,
          rotation: Math.round(Math.random() * 540 - 270),
          couleur: COULEURS[index % COULEURS.length],
          retard: Math.round(Math.random() * 120),
          taille: 6 + Math.round(Math.random() * 5),
        };
      }),
    []
  );

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      <div className="absolute left-1/2 top-1/2">
        {grains.map((grain) => (
          <span
            key={grain.id}
            className="absolute block rounded-[2px]"
            style={{
              width: grain.taille,
              height: grain.taille * 1.6,
              backgroundColor: grain.couleur,
              animation: `confetti-${grain.id % 2 ? 'a' : 'b'} ${DUREE}ms cubic-bezier(0.15, 0.6, 0.3, 1) ${grain.retard}ms forwards`,
              // Les valeurs propres à ce grain passent par des variables : une
              // seule paire de keyframes suffit pour vingt-deux trajectoires.
              '--x': `${grain.x}px`,
              '--y': `${grain.y}px`,
              '--r': `${grain.rotation}deg`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
