const prisma = require('../config/prisma');
const { enregistrerInstantane } = require('./backup.service');
const { cloturer, rattraper } = require('./closing.service');
const { formatDate } = require('../utils/helpers');

/**
 * Travaux de nuit : cloture de la veille et sauvegarde complete.
 *
 * Pourquoi dans le processus de l'API plutot qu'une tache planifiee sur le PC
 * du gerant : une sauvegarde qui depend d'un ordinateur allume a 3 h du matin
 * ne se declenche pas, et son echec ne se voit pas. Ici, le serveur tourne de
 * toute facon, et le resultat est visible dans l'application.
 *
 * La Cote d'Ivoire vit a UTC toute l'annee : 3 h serveur = 3 h a Abidjan,
 * quand le maquis est ferme.
 */

const HEURE = 3;

/** Delai avant le prochain passage a 3 h. */
function prochainPassage(maintenant = new Date()) {
  const cible = new Date(maintenant);
  cible.setUTCHours(HEURE, 0, 0, 0);
  if (cible <= maintenant) cible.setUTCDate(cible.getUTCDate() + 1);
  return cible.getTime() - maintenant.getTime();
}

function hier() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

/**
 * Un passage complet, pour tous les restaurants.
 *
 * Aucune erreur ne remonte : un restaurant qui echoue ne doit ni arreter les
 * autres, ni faire tomber le processus au milieu de la nuit.
 */
async function travauxDeNuit() {
  const restaurants = await prisma.restaurant.findMany({ select: { id: true, name: true } });

  for (const restaurant of restaurants) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await cloturer(restaurant.id, hier());
      // eslint-disable-next-line no-console
      console.log(`[NUIT] cloture du ${formatDate(hier())} - ${restaurant.name}`);
    } catch (error) {
      console.error(`[NUIT] cloture impossible (${restaurant.name}) :`, error.message);
    }

    // eslint-disable-next-line no-await-in-loop
    const sauvegarde = await enregistrerInstantane(restaurant.id, 'AUTOMATIQUE');
    // eslint-disable-next-line no-console
    console.log(
      sauvegarde.ok
        ? `[NUIT] sauvegarde ${Math.round(sauvegarde.snapshot.sizeBytes / 1024)} Ko - ${restaurant.name}`
        : `[NUIT] sauvegarde en echec (${restaurant.name}) : ${sauvegarde.erreur}`
    );
  }
}

/**
 * Au demarrage : rattraper ce qui a ete manque.
 *
 * Un serveur redemarre, une mise en veille, un deploiement a 3 h - sans
 * rattrapage, la journee serait perdue pour toujours.
 */
async function rattrapageAuDemarrage() {
  const restaurants = await prisma.restaurant.findMany({ select: { id: true, name: true } });

  for (const restaurant of restaurants) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const resultat = await rattraper(restaurant.id);
      if (resultat.clotures > 0) {
        // eslint-disable-next-line no-console
        console.log(`[NUIT] ${resultat.clotures} journée(s) rattrapée(s) - ${restaurant.name}`);
      }
    } catch (error) {
      console.error(`[NUIT] rattrapage impossible (${restaurant.name}) :`, error.message);
    }

    // Aucune sauvegarde depuis plus de 20 h : on en prend une tout de suite
    // plutot que d'attendre la nuit suivante.
    // eslint-disable-next-line no-await-in-loop
    const derniere = await prisma.backupSnapshot.findFirst({
      where: { restaurantId: restaurant.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const vieille = !derniere || Date.now() - derniere.createdAt.getTime() > 20 * 3600 * 1000;
    if (vieille) {
      // eslint-disable-next-line no-await-in-loop
      const sauvegarde = await enregistrerInstantane(restaurant.id, 'AUTOMATIQUE');
      // eslint-disable-next-line no-console
      console.log(
        sauvegarde.ok
          ? `[NUIT] sauvegarde de rattrapage - ${restaurant.name}`
          : `[NUIT] sauvegarde de rattrapage en echec : ${sauvegarde.erreur}`
      );
    }
  }
}

let minuteur = null;

function planifier() {
  const delai = prochainPassage();
  minuteur = setTimeout(async () => {
    try {
      await travauxDeNuit();
    } catch (error) {
      console.error('[NUIT] echec general :', error.message);
    }
    planifier();
  }, delai);
  // unref : le minuteur ne doit jamais retenir le processus a l'arret.
  minuteur.unref();

  // eslint-disable-next-line no-console
  console.log(`[OK] Travaux de nuit planifiés dans ${Math.round(delai / 60000)} min (3 h)`);
}

function demarrer() {
  // Les tests pilotent ces fonctions directement : un planificateur qui
  // tournerait en parallele rendrait leurs resultats imprevisibles.
  if (process.env.NODE_ENV === 'test') return;

  planifier();
  rattrapageAuDemarrage().catch((error) =>
    console.error('[NUIT] rattrapage impossible :', error.message)
  );
}

function arreter() {
  if (minuteur) clearTimeout(minuteur);
  minuteur = null;
}

module.exports = { demarrer, arreter, travauxDeNuit, rattrapageAuDemarrage, prochainPassage };
