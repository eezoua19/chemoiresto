#!/usr/bin/env node
/**
 * Sauvegarde quotidienne des donnees de production.
 *
 * Les sauvegardes de volume de l'hebergeur sont reservees aux offres payantes.
 * Ce script telecharge l'export complet via l'API et le range dans un dossier
 * local, avec rotation automatique.
 *
 *   node scripts/backup.js
 *
 * Variables d'environnement :
 *   BACKUP_API_URL    URL de l'API          (defaut : API_URL, sinon local)
 *   BACKUP_EMAIL      compte administrateur
 *   BACKUP_PASSWORD   mot de passe
 *   BACKUP_DIR        dossier de destination (defaut : ./backups)
 *   BACKUP_KEEP       nombre de fichiers conserves (defaut : 30)
 *
 * Une sauvegarde posee sur la meme machine que rien d'autre ne protege de pas
 * grand-chose : rangez BACKUP_DIR dans un dossier synchronise (OneDrive, Drive)
 * pour obtenir une copie hors site sans rien payer.
 */

const fs = require('fs');
const path = require('path');

const API = (process.env.BACKUP_API_URL || process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const EMAIL = process.env.BACKUP_EMAIL;
const PASSWORD = process.env.BACKUP_PASSWORD;
const DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'));
const KEEP = Number(process.env.BACKUP_KEEP || 30);

function echouer(message) {
  console.error(`[SAUVEGARDE] ECHEC : ${message}`);
  process.exit(1);
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    echouer('BACKUP_EMAIL et BACKUP_PASSWORD sont requis (voir .env.example).');
  }

  const connexion = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).catch((error) => echouer(`API injoignable : ${error.message}`));

  const session = await connexion.json().catch(() => ({}));
  if (!connexion.ok || !session?.data?.token) {
    echouer(`connexion refusee (HTTP ${connexion.status}) : ${session?.message || 'reponse inattendue'}`);
  }
  if (session.data.user?.role !== 'ADMIN') {
    echouer('ce compte n\'est pas administrateur.');
  }

  const reponse = await fetch(`${API}/api/backup`, {
    headers: { Authorization: `Bearer ${session.data.token}` },
  });
  if (!reponse.ok) echouer(`export refuse (HTTP ${reponse.status})`);

  const contenu = await reponse.text();

  // Garde-fou : un export vide ou tronque ne doit jamais ecraser l'historique.
  let instantane;
  try {
    instantane = JSON.parse(contenu);
  } catch {
    echouer('reponse illisible : export interrompu.');
  }
  if (!instantane?.donnees?.restaurant) {
    echouer('export sans restaurant : donnees incompletes, rien n\'est ecrit.');
  }

  fs.mkdirSync(DIR, { recursive: true });
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fichier = path.join(DIR, `chemoiresto-${horodatage}.json`);
  fs.writeFileSync(fichier, contenu, 'utf8');

  const ko = Math.round(Buffer.byteLength(contenu) / 1024);
  const comptes = instantane.metadonnees?.comptes || {};
  console.log(`[SAUVEGARDE] ${fichier} (${ko} Ko)`);
  console.log(
    `[SAUVEGARDE] ${comptes.products ?? '?'} produits, ${comptes.orders ?? '?'} commandes, ` +
      `${comptes.tables ?? '?'} tables, ${comptes.dailyMenus ?? '?'} menus`
  );

  // Rotation : on ne garde que les KEEP fichiers les plus recents.
  const anciens = fs
    .readdirSync(DIR)
    .filter((nom) => /^chemoiresto-.*\.json$/.test(nom))
    .sort()
    .reverse()
    .slice(KEEP);

  for (const nom of anciens) fs.unlinkSync(path.join(DIR, nom));
  if (anciens.length) console.log(`[SAUVEGARDE] ${anciens.length} ancienne(s) sauvegarde(s) supprimee(s)`);
}

main().catch((error) => echouer(error.message));
