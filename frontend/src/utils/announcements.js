/**
 * Phrases lues à voix haute au personnel.
 *
 * Écrites pour l'oreille, pas pour l'écran : on ne lit ni le numéro de commande
 * (« CMD-20260912-0004 » est incomprehensible à l'oral) ni le sigle FCFA, et on
 * s'arrêté a trois plats pour que l'annonce reste courte.
 */

/**
 * « 01 » se lit « zero un » par une synthese vocale : on enleve le zero initial
 * pour entendre « table un ». L'affichage à l'écran, lui, garde « Table 01 ».
 */
function numeroDeTable(numero) {
  if (numero === undefined || numero === null) return null;
  const nettoye = String(numero).replace(/^0+(?=\d)/, '');
  return nettoye || String(numero);
}

/** Detaille les plats, en se limitant aux trois premiers. */
function resumerPlats(items = []) {
  if (!items.length) return '';

  const nommer = (item) => {
    const quantite = Number(item.quantity) || 1;
    return quantite > 1 ? `${quantite} ${item.productName}` : item.productName;
  };

  const premiers = items.slice(0, 3).map(nommer);
  const reste = items.length - premiers.length;

  let liste = premiers.join(', ');
  if (reste > 0) liste += `, et ${reste} autre${reste > 1 ? 's' : ''} plat${reste > 1 ? 's' : ''}`;
  return liste;
}

/**
 * Un code de retrait « 0042 » doit s'entendre chiffre par chiffre : lu tel
 * quel, la synthese vocale annonce « quarante-deux » et le comptoir cherche
 * un code qui n'existe pas.
 */
function codeEpelle(code) {
  if (!code) return null;
  return String(code).split('').join(' ');
}

/**
 * « Vous avez recu une commande. Table 3. Poulet braise. Total 6000 francs. »
 * « Vous avez recu une commande à emporter. Code 0 0 4 2. ... »
 */
export function annonceCommande(order) {
  const emporter = order?.type === 'TAKEAWAY';
  const entree = emporter
    ? 'Vous avez reçu une commande à emporter.'
    : 'Vous avez reçu une commande.';

  let provenance = '';
  if (emporter) {
    const code = codeEpelle(order?.pickupCode);
    provenance = code ? `Code ${code}.` : '';
  } else {
    const numero = numeroDeTable(order?.table?.number);
    provenance = numero ? `Table ${numero}.` : '';
  }

  const plats = resumerPlats(order?.items);
  const total = Number(order?.total);
  const montant = Number.isFinite(total) && total > 0 ? `Total ${Math.round(total)} francs.` : '';

  return [entree, provenance, plats ? `${plats}.` : '', montant].filter(Boolean).join(' ');
}

/**
 * Rappel du client : personne n'est venu.
 *
 * On dit « toujours » et on donne le rang du rappel - c'est ce qui distingue,
 * à l'oreille, une table qui patiente d'une table qu'on a oubliée.
 */
const RANGS = ['', 'Premier rappel.', 'Deuxième rappel.', 'Troisième rappel.'];

export function annonceRappel(request) {
  const numero = numeroDeTable(request?.table?.number);
  const table = numero ? `La table ${numero}` : 'Une table';
  const objet =
    request?.type === 'BILL' ? "attend toujours l'addition" : 'attend toujours une serveuse';
  const rang = RANGS[request?.reminderCount] || 'Rappel.';
  return `${rang} ${table} ${objet}.`;
}

/** « Table 3 demande l'addition. » / « Table 3 appelle une serveuse. » */
export function annonceDemande(request) {
  const numero = numeroDeTable(request?.table?.number);
  const table = numero ? `Table ${numero}` : 'Une table';
  const objet = request?.type === 'BILL' ? "demande l'addition" : 'appelle une serveuse';
  return `${table} ${objet}.`;
}
