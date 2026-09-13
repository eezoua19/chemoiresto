/**
 * Le plat qui s'envole dans le panier.
 *
 * Technique dite « FLIP » : on mesure d'où part l'image et où elle doit
 * arriver, puis on anime un clone entre les deux. Le clone est posé en
 * `position: fixed` au-dessus de tout, si bien que rien dans la page ne bouge
 * — seul un calque se déplace, ce que le navigateur sait faire sans jamais
 * recalculer la mise en page. C'est ce qui permet à cette animation de tenir
 * 60 images par seconde sur un téléphone d'entrée de gamme.
 *
 * Aucun état React n'est impliqué : l'animation vit et meurt hors de React,
 * donc un changement d'écran pendant le vol ne laisse rien derrière lui.
 */

const DUREE = 650;

/** Le système demande-t-il de limiter les animations ? */
function mouvementReduit() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/**
 * Fait voler une copie de `source` jusqu'à `cible`.
 *
 * @param {Element} source  ce qu'on voit partir (la photo du plat)
 * @param {Element|DOMRect} cible  où il doit atterrir : la barre du panier,
 *   ou un simple rectangle quand elle n'existe pas encore (panier vide).
 * @returns {Promise<void>} résolue quand le vol est terminé
 */
export function volerVersLePanier(source, cible) {
  // Pas de vol si l'utilisateur a demandé le calme, ou si le navigateur est
  // trop ancien pour l'API d'animation : on ne casse jamais l'ajout au panier
  // pour une question de decoration.
  if (!source || !cible || mouvementReduit() || typeof source.animate !== 'function') {
    return Promise.resolve();
  }

  const depart = source.getBoundingClientRect();
  const arrivee = typeof cible.getBoundingClientRect === 'function'
    ? cible.getBoundingClientRect()
    : cible;
  if (!depart.width || !arrivee.width) return Promise.resolve();

  const clone = source.cloneNode(true);
  clone.style.cssText = `
    position: fixed;
    left: ${depart.left}px;
    top: ${depart.top}px;
    width: ${depart.width}px;
    height: ${depart.height}px;
    margin: 0;
    border-radius: 16px;
    overflow: hidden;
    pointer-events: none;
    z-index: 60;
    will-change: transform, opacity;
  `;
  document.body.appendChild(clone);

  const deltaX = arrivee.left + arrivee.width / 2 - (depart.left + depart.width / 2);
  const deltaY = arrivee.top + arrivee.height / 2 - (depart.top + depart.height / 2);
  // L'assiette prend de la hauteur avant de redescendre : une trajectoire
  // droite ressemble à un glissement, une courbe ressemble à un geste.
  const hauteurDArc = Math.min(140, Math.abs(deltaY) * 0.35 + 60);
  const echelleFinale = Math.max(0.12, (arrivee.height * 0.55) / depart.height);

  const animation = clone.animate(
    [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
      {
        transform: `translate(${deltaX * 0.45}px, ${deltaY * 0.35 - hauteurDArc}px)
                    scale(${(1 + echelleFinale) / 2}) rotate(-8deg)`,
        opacity: 1,
        offset: 0.45,
      },
      {
        transform: `translate(${deltaX}px, ${deltaY}px) scale(${echelleFinale}) rotate(6deg)`,
        opacity: 0.2,
        offset: 1,
      },
    ],
    { duration: DUREE, easing: 'cubic-bezier(0.35, 0.15, 0.25, 1)', fill: 'forwards' }
  );

  // Filet : si le client passe sur une autre application en plein vol, le
  // navigateur met l'animation en pause et `finished` ne se resout jamais. Sans
  // ce minuteur, le clone resterait colle a l'ecran a son retour.
  const secours = setTimeout(() => clone.remove(), DUREE + 600);

  return animation.finished
    .catch(() => {})
    .finally(() => {
      clearTimeout(secours);
      clone.remove();
    });
}

/**
 * Le petit sursaut du panier quand le plat y tombe.
 * Joué à part, pour rester synchronisé avec la fin du vol.
 */
export function secouerLePanier(cible) {
  if (!cible || mouvementReduit() || typeof cible.animate !== 'function') return;

  cible.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.06)', offset: 0.4 },
      { transform: 'scale(0.98)', offset: 0.7 },
      { transform: 'scale(1)' },
    ],
    { duration: 380, easing: 'ease-out' }
  );
}

/** Durée du vol, pour que l'appelant puisse s'y accorder. */
export const DUREE_DU_VOL = DUREE;
