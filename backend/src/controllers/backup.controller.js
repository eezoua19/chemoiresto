const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const {
  CONSERVES,
  construireInstantane,
  enregistrerInstantane,
  serialiser,
} = require('../services/backup.service');

/**
 * Sauvegardes du restaurant.
 *
 * Les sauvegardes de volume de l'hebergeur sont reservees aux offres payantes :
 * ces instantanes sont le filet de securite qui fonctionne sur toutes les
 * offres. Une prise automatique a lieu chaque nuit ; celle qu'on telecharge
 * reste la seule qui survivrait a la perte de la base.
 */

/** Nom de fichier lisible et trie naturellement. */
function nomDeFichier(date) {
  const horodatage = new Date(date).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `chemoiresto-${horodatage}.json`;
}

/** GET /api/backup - instantane complet, telecharge a la volee (ADMIN) */
const exporter = asyncHandler(async (req, res) => {
  const instantane = await construireInstantane(req.user.restaurantId);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nomDeFichier(new Date())}"`);
  return res.json(instantane);
});

/** GET /api/backup/list - les sauvegardes conservees (ADMIN) */
const list = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;

  // Le contenu n'est jamais charge ici : plusieurs Mo par ligne.
  const lignes = await prisma.backupSnapshot.findMany({
    where: { restaurantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      trigger: true,
      sizeBytes: true,
      counts: true,
      note: true,
      createdAt: true,
    },
  });

  const derniere = lignes[0] || null;

  return success(
    res,
    {
      snapshots: lignes.map(serialiser),
      last: derniere ? serialiser(derniere) : null,
      // Ce que l'interface doit pouvoir dire sans le recalculer elle-meme.
      hoursSinceLast: derniere
        ? Math.floor((Date.now() - derniere.createdAt.getTime()) / 3600000)
        : null,
      kept: CONSERVES,
    },
    'Sauvegardes récupérées'
  );
});

/** POST /api/backup - prend une sauvegarde tout de suite (ADMIN) */
const run = asyncHandler(async (req, res) => {
  const resultat = await enregistrerInstantane(req.user.restaurantId, 'MANUEL');
  if (!resultat.ok) throw ApiError.internal(`Sauvegarde impossible : ${resultat.erreur}`);

  const ligne = await prisma.backupSnapshot.findUnique({
    where: { id: resultat.snapshot.id },
    select: {
      id: true,
      trigger: true,
      sizeBytes: true,
      counts: true,
      note: true,
      createdAt: true,
    },
  });

  return success(res, serialiser(ligne), 'Sauvegarde effectuée');
});

/** GET /api/backup/:id/download - retelecharge une sauvegarde conservee */
const download = asyncHandler(async (req, res) => {
  const ligne = await prisma.backupSnapshot.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
  });
  if (!ligne) throw ApiError.notFound('Sauvegarde introuvable');
  if (!ligne.content) {
    throw ApiError.badRequest(
      ligne.note || 'Le contenu de cette sauvegarde n\'a pas été conservé.'
    );
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nomDeFichier(ligne.createdAt)}"`);
  // Deja serialise en base : on l'envoie tel quel plutot que de le reparser.
  return res.send(ligne.content);
});

module.exports = { exporter, list, run, download };
