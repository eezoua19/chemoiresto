/**
 * Présentation du journal des actions.
 *
 * Le serveur envoie des codes stables (PRODUIT_SUPPRIME) ; c'est ici qu'ils
 * deviennent lisibles. Un code inconnu — parce que le serveur est plus récent
 * que l'écran — s'affiche tel quel plutôt que de disparaître.
 */

export const LIBELLES_ACTION = {
  PRODUIT_CREE: 'Plat créé',
  PRODUIT_MODIFIE: 'Plat modifié',
  PRODUIT_SUPPRIME: 'Plat supprimé',
  PRODUIT_DISPONIBILITE: 'Disponibilité',
  CATEGORIE_CREEE: 'Catégorie créée',
  CATEGORIE_MODIFIEE: 'Catégorie modifiée',
  CATEGORIE_SUPPRIMEE: 'Catégorie supprimée',
  MENU_CREE: 'Menu créé',
  MENU_MODIFIE: 'Menu modifié',
  MENU_SUPPRIME: 'Menu supprimé',
  MENU_DUPLIQUE: 'Menu dupliqué',
  TABLE_CREEE: 'Table créée',
  TABLE_MODIFIEE: 'Table modifiée',
  TABLE_STATUT: 'Table activée / désactivée',
  TABLE_SUPPRIMEE: 'Table supprimée',
  TABLE_QR_REGENERE: 'QR Code régénéré',
  COMPTE_CREE: 'Compte créé',
  COMPTE_MODIFIE: 'Compte modifié',
  COMPTE_SUPPRIME: 'Compte supprimé',
  MOT_DE_PASSE_REINITIALISE: 'Mot de passe réinitialisé',
  ABONNEMENT_CREE: 'Abonnement créé',
  ABONNEMENT_MODIFIE: 'Abonnement modifié',
  ABONNEMENT_STATUT: 'Abonnement suspendu / réactivé',
  ABONNEMENT_RENOUVELE: 'Abonnement renouvelé',
  ABONNEMENT_SUPPRIME: 'Abonnement supprimé',
  PARAMETRES_MODIFIES: 'Paramètres modifiés',
  EMPORTER_BASCULE: 'Commandes à emporter',
  SAUVEGARDE_EXPORTEE: 'Sauvegarde exportée',
  SAUVEGARDE_MANUELLE: 'Sauvegarde manuelle',
  CLOTURE_RECALCULEE: 'Clôture recalculée',
  REMISE_A_ZERO: 'Remise à zéro',
};

const ROUGE = { point: 'bg-red-500', badge: 'bg-red-100 text-red-800' };
const AMBRE = { point: 'bg-amber-500', badge: 'bg-amber-100 text-amber-900' };
const VERT = { point: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' };
const NEUTRE = { point: 'bg-ink-300', badge: 'bg-ink-100 text-ink-700' };

/**
 * Couleur de la ligne, par gravité et non par rubrique.
 *
 * Ce qu'on cherche dans un journal, c'est ce qui a été détruit : le rouge est
 * réservé à l'irréversible, pour qu'un parcours des yeux suffise à le repérer.
 */
export function tonDeLAction(action) {
  if (!action) return NEUTRE;
  if (action === 'REMISE_A_ZERO') return ROUGE;
  if (action.endsWith('_SUPPRIME') || action.endsWith('_SUPPRIMEE')) return ROUGE;
  if (
    action === 'MOT_DE_PASSE_REINITIALISE' ||
    action === 'TABLE_QR_REGENERE' ||
    action === 'SAUVEGARDE_EXPORTEE' ||
    action === 'ABONNEMENT_STATUT' ||
    action === 'TABLE_STATUT'
  ) {
    return AMBRE;
  }
  if (action.endsWith('_CREE') || action.endsWith('_CREEE')) return VERT;
  return NEUTRE;
}
