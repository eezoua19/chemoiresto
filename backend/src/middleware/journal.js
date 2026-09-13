const { enregistrer } = require('../services/audit.service');

/**
 * Journal des actions de gestion.
 *
 * Le choix de fond : une liste blanche, pas une trace de tout. Un journal qui
 * enregistre chaque appel devient illisible, et un journal illisible n'est
 * jamais consulte. On y met ce qu'on voudrait pouvoir retrouver six mois plus
 * tard : ce qui a ete supprime, ce qui a change de prix, qui a eu un compte.
 *
 * Ce qui est deliberement absent :
 *   - les commandes et leurs statuts, deja traces dans OrderStatusHistory ;
 *   - les passages d'abonnes, deja traces dans SubscriptionUsage ;
 *   - les consultations : lire une page n'est pas une action de gestion.
 *
 * Un controleur peut affiner la ligne en posant `req.journal = { label,
 * details, entityId }` - indispensable pour les suppressions, ou la reponse ne
 * contient plus rien a nommer.
 */

/** "2029-03-10" se lit mal : le journal parle francais, donc 10/03/2029. */
const enFrancais = (iso) => {
  if (!iso) return '?';
  const [annee, mois, jour] = String(iso).slice(0, 10).split('-');
  return jour ? `${jour}/${mois}/${annee}` : String(iso);
};

/** Nom lisible d'une entite, quelle que soit la forme de la reponse. */
const nomme = (data, repli) => data?.name || data?.fullName || data?.number || repli;

const DESCRIPTEURS = {
  // -------------------------------- Carte --------------------------------
  'POST /products': {
    action: 'PRODUIT_CREE',
    entity: 'Produit',
    label: (req, data) => `Plat créé : ${nomme(data, 'sans nom')}`,
  },
  'PUT /products/:id': {
    action: 'PRODUIT_MODIFIE',
    entity: 'Produit',
    label: (req, data) => `Plat modifié : ${nomme(data, `#${req.params.id}`)}`,
  },
  'DELETE /products/:id': {
    action: 'PRODUIT_SUPPRIME',
    entity: 'Produit',
    label: (req) => `Plat supprimé : #${req.params.id}`,
  },
  'PATCH /products/:id/availability': {
    action: 'PRODUIT_DISPONIBILITE',
    entity: 'Produit',
    label: (req, data) =>
      data?.isAvailable === false
        ? `Rupture déclarée : ${nomme(data, `#${req.params.id}`)}`
        : `Retour en stock : ${nomme(data, `#${req.params.id}`)}`,
  },
  'POST /categories': {
    action: 'CATEGORIE_CREEE',
    entity: 'Categorie',
    label: (req, data) => `Catégorie créée : ${nomme(data, 'sans nom')}`,
  },
  'PUT /categories/:id': {
    action: 'CATEGORIE_MODIFIEE',
    entity: 'Categorie',
    label: (req, data) => `Catégorie modifiée : ${nomme(data, `#${req.params.id}`)}`,
  },
  'DELETE /categories/:id': {
    action: 'CATEGORIE_SUPPRIMEE',
    entity: 'Categorie',
    label: (req) => `Catégorie supprimée : #${req.params.id}`,
  },

  // -------------------------------- Menus --------------------------------
  'POST /menus': {
    action: 'MENU_CREE',
    entity: 'Menu',
    label: (req, data) => `Menu du jour créé pour le ${enFrancais(data?.date)}`,
  },
  'PUT /menus/:id': {
    action: 'MENU_MODIFIE',
    entity: 'Menu',
    label: (req, data) => `Menu modifié : ${data?.date ? enFrancais(data.date) : `#${req.params.id}`}`,
  },
  'DELETE /menus/:id': {
    action: 'MENU_SUPPRIME',
    entity: 'Menu',
    label: (req) => `Menu supprimé : #${req.params.id}`,
  },
  'POST /menus/:id/duplicate': {
    action: 'MENU_DUPLIQUE',
    entity: 'Menu',
    label: (req, data) => `Menu dupliqué vers le ${enFrancais(data?.date)}`,
  },

  // -------------------------------- Tables -------------------------------
  'POST /tables': {
    action: 'TABLE_CREEE',
    entity: 'Table',
    label: (req, data) => `Table créée : ${data?.number || '?'}`,
  },
  'PUT /tables/:id': {
    action: 'TABLE_MODIFIEE',
    entity: 'Table',
    label: (req, data) => `Table modifiée : ${data?.number || `#${req.params.id}`}`,
  },
  'PATCH /tables/:id/status': {
    action: 'TABLE_STATUT',
    entity: 'Table',
    label: (req, data) =>
      data?.status === 'INACTIVE'
        ? `Table désactivée : ${data?.number || `#${req.params.id}`}`
        : `Table réactivée : ${data?.number || `#${req.params.id}`}`,
  },
  'DELETE /tables/:id': {
    action: 'TABLE_SUPPRIMEE',
    entity: 'Table',
    label: (req) => `Table supprimée : #${req.params.id}`,
  },
  'POST /tables/:id/qrcode/regenerate': {
    action: 'TABLE_QR_REGENERE',
    entity: 'Table',
    // Le jeton change : les affiches deja posees cessent de fonctionner.
    label: (req) => `QR Code régénéré pour la table #${req.params.id}`,
  },

  // ------------------------------- Comptes -------------------------------
  'POST /users/servers': {
    action: 'COMPTE_CREE',
    entity: 'Utilisateur',
    label: (req, data) => `Compte serveuse créé : ${nomme(data, 'sans nom')}`,
  },
  'PUT /users/servers/:id': {
    action: 'COMPTE_MODIFIE',
    entity: 'Utilisateur',
    label: (req, data) => `Compte modifié : ${nomme(data, `#${req.params.id}`)}`,
  },
  'DELETE /users/servers/:id': {
    action: 'COMPTE_SUPPRIME',
    entity: 'Utilisateur',
    label: (req) => `Compte supprimé : #${req.params.id}`,
  },
  'PUT /users/servers/:id/password': {
    action: 'MOT_DE_PASSE_REINITIALISE',
    entity: 'Utilisateur',
    // Le mot de passe lui-meme n'apparait evidemment nulle part.
    label: (req) => `Mot de passe réinitialisé : compte #${req.params.id}`,
  },

  // ------------------------------ Abonnements ----------------------------
  'POST /subscriptions': {
    action: 'ABONNEMENT_CREE',
    entity: 'Abonnement',
    label: (req, data) => `Abonnement créé : ${data?.fullName || ''} (${data?.number || '?'})`,
  },
  'PUT /subscriptions/:id': {
    action: 'ABONNEMENT_MODIFIE',
    entity: 'Abonnement',
    label: (req, data) => `Abonnement modifié : ${data?.number || `#${req.params.id}`}`,
  },
  'PATCH /subscriptions/:id/status': {
    action: 'ABONNEMENT_STATUT',
    entity: 'Abonnement',
    label: (req, data) => {
      const etats = { ACTIVE: 'réactivé', SUSPENDED: 'suspendu', INACTIVE: 'désactivé' };
      return `Abonnement ${etats[data?.status] || 'modifié'} : ${
        data?.number || `#${req.params.id}`
      }`;
    },
  },
  'POST /subscriptions/:id/renew': {
    action: 'ABONNEMENT_RENOUVELE',
    entity: 'Abonnement',
    label: (req, data) => `Abonnement renouvelé : ${data?.number || `#${req.params.id}`}`,
  },
  'DELETE /subscriptions/:id': {
    action: 'ABONNEMENT_SUPPRIME',
    entity: 'Abonnement',
    label: (req, data) => `Abonnement supprimé : ${data?.number || `#${req.params.id}`}`,
  },

  // ----------------------------- Etablissement ---------------------------
  'PUT /restaurant': {
    action: 'PARAMETRES_MODIFIES',
    entity: 'Restaurant',
    label: () => 'Informations du restaurant modifiées',
  },
  'PATCH /restaurant/emporter': {
    action: 'EMPORTER_BASCULE',
    entity: 'Restaurant',
    label: (req, data) =>
      data?.takeawayEnabled ? 'Commandes à emporter ouvertes' : 'Commandes à emporter fermées',
  },

  // ------------------------------ Sauvegarde -----------------------------
  // Un export emporte toutes les donnees du restaurant : il doit laisser une
  // trace, meme si techniquement c'est une simple lecture.
  'GET /backup': {
    action: 'SAUVEGARDE_EXPORTEE',
    entity: 'Sauvegarde',
    label: () => 'Export complet des données téléchargé',
  },
  'POST /backup': {
    action: 'SAUVEGARDE_MANUELLE',
    entity: 'Sauvegarde',
    label: () => 'Sauvegarde déclenchée à la main',
  },

  // ------------------------------- Clotures ------------------------------
  'POST /closings/:date': {
    action: 'CLOTURE_RECALCULEE',
    entity: 'Cloture',
    label: (req) => `Journée du ${enFrancais(req.params.date)} clôturée à la main`,
  },
};

/** "DELETE /products/:id" a partir de la requete, une fois le routage fait. */
function cle(req) {
  if (!req.route) return null;
  const base = String(req.baseUrl || '').replace(/^\/api/, '');
  const chemin = req.route.path === '/' ? '' : req.route.path;
  return `${req.method} ${base}${chemin}`;
}

function tracer(req, corps) {
  const descripteur = DESCRIPTEURS[cle(req)];
  if (!descripteur || !req.user) return;

  const data = corps && typeof corps === 'object' ? corps.data : null;
  const precisions = req.journal || {};

  const identifiant =
    precisions.entityId ?? (data && Number.isInteger(data.id) ? data.id : Number(req.params.id));

  // Volontairement sans await : le client n'a pas a attendre le journal.
  enregistrer(req.user, {
    action: descripteur.action,
    entity: descripteur.entity,
    entityId: Number.isInteger(identifiant) ? identifiant : null,
    label: precisions.label || descripteur.label(req, data),
    details: precisions.details || null,
  });
}

/**
 * Se pose avant les routes et observe les reponses reussies. Passer par la
 * reponse plutot que par chaque controleur garantit qu'on ne journalise jamais
 * une action qui a echoue - et qu'aucune route n'est oubliee au fil du temps.
 */
function journalMiddleware(req, res, next) {
  const envoyer = res.json.bind(res);

  res.json = (corps) => {
    try {
      if (res.statusCode < 400 && corps?.success !== false) tracer(req, corps);
    } catch (error) {
      console.error('[JOURNAL] trace impossible :', error.message);
    }
    return envoyer(corps);
  };

  next();
}

module.exports = { journalMiddleware, DESCRIPTEURS };
