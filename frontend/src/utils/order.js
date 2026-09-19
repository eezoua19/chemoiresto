/**
 * D'ou vient une commande.
 *
 * Depuis l'ajout de la vente à emporter, une commande n'a plus forcement de
 * table : afficher "Table " suivi de rien laisserait le personnel sans réponse.
 * Toutes les vues passent par ces deux fonctions.
 */

export function estAEmporter(order) {
  return order?.type === 'TAKEAWAY';
}

/** Étiquette complete : "Table 03", "À emporter - code 0042" ou "Sur place - code 0042". */
export function libelleProvenance(order) {
  if (!order) return '';
  if (estAEmporter(order)) {
    const base = order.eatInLater ? 'Sur place' : 'À emporter';
    return order.pickupCode ? `${base} - code ${order.pickupCode}` : base;
  }
  return order.table?.number ? `Table ${order.table.number}` : 'Table inconnue';
}

/** Version courte pour les tableaux et les badges : "03", "Emporter 0042" ou "Sur place 0042". */
export function libelleCourt(order) {
  if (!order) return '';
  if (estAEmporter(order)) {
    const base = order.eatInLater ? 'Sur place' : 'Emporter';
    return order.pickupCode ? `${base} ${order.pickupCode}` : base;
  }
  return order.table?.number || '-';
}
