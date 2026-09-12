/**
 * Phrases lues a voix haute au personnel.
 *
 * Ecrites pour l'oreille, pas pour l'ecran : on ne lit ni le numero de commande
 * (« CMD-20260912-0004 » est incomprehensible a l'oral) ni le sigle FCFA, et on
 * s'arrete a trois plats pour que l'annonce reste courte.
 */

/**
 * « 01 » se lit « zero un » par une synthese vocale : on enleve le zero initial
 * pour entendre « table un ». L'affichage a l'ecran, lui, garde « Table 01 ».
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

/** « Vous avez recu une commande. Table 3. Poulet braise, 2 Alloco. Total 6000 francs. » */
export function annonceCommande(order) {
  const numero = numeroDeTable(order?.table?.number);
  const table = numero ? `Table ${numero}.` : '';
  const plats = resumerPlats(order?.items);
  const total = Number(order?.total);
  const montant = Number.isFinite(total) && total > 0 ? `Total ${Math.round(total)} francs.` : '';

  return ['Vous avez recu une commande.', table, plats ? `${plats}.` : '', montant]
    .filter(Boolean)
    .join(' ');
}

/** « Table 3 demande l'addition. » / « Table 3 appelle une serveuse. » */
export function annonceDemande(request) {
  const numero = numeroDeTable(request?.table?.number);
  const table = numero ? `Table ${numero}` : 'Une table';
  const objet = request?.type === 'BILL' ? "demande l'addition" : 'appelle une serveuse';
  return `${table} ${objet}.`;
}
