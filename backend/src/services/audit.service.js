const prisma = require('../config/prisma');

/**
 * Journal des actions de gestion.
 *
 * Une regle : ecrire dans le journal ne doit JAMAIS faire echouer l'action
 * elle-meme. Si l'ecriture tombe, on trace dans la console et l'application
 * continue - refuser une suppression parce que le journal est indisponible
 * serait pire que la perte d'une ligne d'historique.
 */

/** Limite de securite : un detail enorme n'a pas sa place en base. */
const DETAILS_MAX = 4000;

function serialiser(entree) {
  let details = null;
  if (entree.details) {
    try {
      details = JSON.parse(entree.details);
    } catch {
      // Ligne ecrite par une version anterieure : on rend le texte brut.
      details = { texte: entree.details };
    }
  }

  return {
    id: entree.id,
    action: entree.action,
    entity: entree.entity,
    entityId: entree.entityId,
    label: entree.label,
    details,
    createdAt: entree.createdAt,
    author: {
      id: entree.userId,
      fullName: entree.userName,
      role: entree.userRole,
      // L'auteur a pu etre supprime depuis : le nom reste, le compte non.
      stillExists: Boolean(entree.user),
    },
  };
}

/**
 * Ecrit une ligne. `auteur` est le req.user du moment : on en recopie le nom,
 * car le compte peut disparaitre alors que la trace doit rester.
 */
async function enregistrer(auteur, { action, entity, entityId = null, label, details = null }) {
  if (!auteur || !action || !label) return null;

  let texte = null;
  if (details) {
    try {
      texte = JSON.stringify(details).slice(0, DETAILS_MAX);
    } catch {
      texte = null;
    }
  }

  try {
    return await prisma.auditLog.create({
      data: {
        restaurantId: auteur.restaurantId,
        userId: auteur.id,
        userName: `${auteur.firstName} ${auteur.lastName}`.trim() || auteur.email,
        userRole: auteur.role,
        action,
        entity,
        entityId: Number.isInteger(entityId) ? entityId : null,
        label,
        details: texte,
      },
    });
  } catch (error) {
    console.error('[JOURNAL] ecriture impossible :', error.message);
    return null;
  }
}

module.exports = { enregistrer, serialiser };
