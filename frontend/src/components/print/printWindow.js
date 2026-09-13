/**
 * Ouverture de la fenêtre d'impression, partagée par les tickets de commande,
 * les feuilles de QR Codes et les tickets d'abonnement.
 */

export function openPrintWindow(html, { width = 420, height = 700 } = {}) {
  const printWindow = window.open('', '_blank', `width=${width},height=${height}`);
  if (!printWindow) {
    // Le navigateur a bloqué la fenêtre : on informe l'appelant.
    throw new Error('Autorisez les fenêtres surgissantes pour imprimer');
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  // Laisse le temps aux images de se charger avant d'ouvrir la boîte d'impression.
  setTimeout(() => {
    printWindow.print();
  }, 400);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
