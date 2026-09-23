const CLE = 'chemoiresto.favoris';

/**
 * Les plats mis de côté par le client, sur ce téléphone uniquement.
 *
 * Pas de compte client : comme l'historique des commandes, les favoris vivent
 * dans le navigateur. Ils sont rangés par restaurant car un même téléphone
 * peut servir dans plusieurs établissements, et le plat 12 de l'un n'a rien à
 * voir avec le plat 12 de l'autre.
 */
function lire() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) || '{}');
    return brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  } catch {
    return {};
  }
}

export function listerFavoris(restaurantId) {
  if (!restaurantId) return [];
  const liste = lire()[restaurantId];
  return Array.isArray(liste) ? liste : [];
}

/**
 * Ajoute ou retire un plat et renvoie la liste à jour.
 *
 * La liste est renvoyée même si l'écriture échoue : le choix vaut alors pour
 * la visite en cours, il ne survivra simplement pas à la fermeture.
 */
export function basculerFavori(restaurantId, productId) {
  const actuels = listerFavoris(restaurantId);
  const suivants = actuels.includes(productId)
    ? actuels.filter((id) => id !== productId)
    : [productId, ...actuels];

  try {
    localStorage.setItem(CLE, JSON.stringify({ ...lire(), [restaurantId]: suivants }));
  } catch {
    // Stockage indisponible : navigation privée ou quota atteint.
  }
  return suivants;
}
