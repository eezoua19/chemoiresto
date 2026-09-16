const CLE = 'chemoiresto.commandes';
// Un client fidele accumule des commandes indefiniment sans jamais purger :
// une limite raisonnable evite que le local storage ne grossisse sans fin.
const MAX = 40;

function lire() {
  try {
    return JSON.parse(localStorage.getItem(CLE) || '[]');
  } catch {
    return [];
  }
}

/** Historique complet, toutes commandes et tous restaurants confondus sur cet appareil. */
export function listerCommandes() {
  return lire();
}

/**
 * Ajoute une commande a l'historique local, juste apres sa creation.
 *
 * Pas de compte client : l'historique vit uniquement dans ce navigateur,
 * comme le suivi par jeton deja en place. On y capture un instantane
 * (nom du restaurant, table, total) plutot qu'une reference seule, pour que
 * la liste reste lisible meme si l'appel de rafraichissement echoue.
 */
export function enregistrerCommande(entree) {
  try {
    const commandes = lire().filter((c) => c.trackingToken !== entree.trackingToken);
    commandes.unshift(entree);
    localStorage.setItem(CLE, JSON.stringify(commandes.slice(0, MAX)));
  } catch {
    // Stockage indisponible (navigation privee, quota) : le suivi reste
    // possible via le lien affiche a la commande, seul l'historique manque.
  }
}

/** Retire une entree devenue introuvable cote serveur (jeton invalide). */
export function retirerCommande(trackingToken) {
  try {
    localStorage.setItem(CLE, JSON.stringify(lire().filter((c) => c.trackingToken !== trackingToken)));
  } catch {
    // Rien a faire : voir enregistrerCommande.
  }
}
