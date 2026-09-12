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

/** Étiquette complete : "Table 03" ou "À emporter - code 0042". */
export function libelleProvenance(order) {
  if (!order) return '';
  if (estAEmporter(order)) {
    return order.pickupCode ? `À emporter - code ${order.pickupCode}` : 'À emporter';
  }
  return order.table?.number ? `Table ${order.table.number}` : 'Table inconnue';
}

/** Version courte pour les tableaux et les badges : "03" ou "À emporter". */
export function libelleCourt(order) {
  if (!order) return '';
  if (estAEmporter(order)) return order.pickupCode ? `Emporter ${order.pickupCode}` : 'Emporter';
  return order.table?.number || '-';
}
