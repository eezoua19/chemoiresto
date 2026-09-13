import { openPrintWindow, escapeHtml } from '../print/printWindow';
import { formatShortDate } from '../../utils/format';

/**
 * Adresse de secours, à taper si le scan échoue. Seul le protocole est retiré :
 * ce qui est imprimé doit être exactement ce qui se tape.
 */
function adresseASaisir(url) {
  if (!url) return '';
  return String(url).replace(/^https?:\/\//, '');
}

/**
 * Ticket d'abonnement remis au client.
 *
 * Format carte (85 x 135 mm), centré sur une A4 avec des repères de découpe :
 * il se glisse dans un portefeuille, et le QR Code reste assez grand pour être
 * scanné du premier coup au comptoir.
 *
 * L'abonné n'a ni compte ni mot de passe : ce papier EST sa preuve. Tout ce
 * qu'il faut pour le retrouver figure dessus, y compris en cas de QR abîmé.
 */
export function printSubscriptionTicket(subscription, ticket, restaurant) {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(subscription.number)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    margin: 0;
    display: flex;
    justify-content: center;
    padding-top: 18mm;
    color: #111;
  }
  .carte {
    width: 85mm;
    border: 2px dashed #999;
    border-radius: 4mm;
    padding: 7mm 6mm 6mm;
    text-align: center;
    page-break-inside: avoid;
  }
  .marque {
    font-size: 12px; font-weight: bold; letter-spacing: 1.5px;
    text-transform: uppercase;
  }
  .titre {
    font-size: 15px; font-weight: 800; letter-spacing: 1px;
    margin: 1mm 0 4mm; text-transform: uppercase;
  }
  .nom { font-size: 19px; font-weight: 700; line-height: 1.2; }
  .numero {
    font-family: "Courier New", monospace;
    font-size: 17px; font-weight: bold; letter-spacing: 1.5px;
    margin: 2mm 0 4mm;
  }
  .carte img { width: 46mm; height: 46mm; }
  table.infos {
    width: 100%; margin: 4mm 0 0; border-collapse: collapse;
    font-size: 11.5px; text-align: left;
  }
  table.infos th {
    font-weight: normal; color: #666; padding: 1.2mm 0; width: 42%;
  }
  table.infos td { padding: 1.2mm 0; font-weight: bold; text-align: right; }
  .consigne {
    margin-top: 4mm; padding-top: 3mm; border-top: 1px solid #ddd;
    font-size: 11px; color: #333; line-height: 1.5;
  }
  .secours { margin-top: 3mm; }
  .secours-titre { display: block; font-size: 8.5px; color: #777; }
  .secours-url {
    display: block; margin-top: 1mm;
    font-family: "Courier New", monospace; font-size: 9px;
    color: #222; word-break: break-all;
  }
</style>
</head>
<body>
  <div class="carte">
    <div class="marque">${escapeHtml(restaurant?.name || 'CHEMOIRESTO')}</div>
    <div class="titre">Carte d'abonnement</div>

    <div class="nom">${escapeHtml(subscription.fullName)}</div>
    <div class="numero">${escapeHtml(subscription.number)}</div>

    <img src="${ticket?.qrDataUrl || ''}" alt="QR Code de l'abonnement ${escapeHtml(subscription.number)}" />

    <table class="infos">
      <tr><th>Formule</th><td>${escapeHtml(subscription.planLabel)}</td></tr>
      <tr><th>Téléphone</th><td>${escapeHtml(subscription.phone)}</td></tr>
      <tr><th>Début</th><td>${escapeHtml(formatShortDate(subscription.startDate))}</td></tr>
      <tr><th>Expiration</th><td>${escapeHtml(formatShortDate(subscription.endDate))}</td></tr>
    </table>

    <div class="consigne">
      Présentez ce ticket au comptoir.<br />
      Le personnel scanne le code pour vérifier votre abonnement.
    </div>

    ${
      ticket?.url
        ? `<div class="secours">
             <span class="secours-titre">Si le scan ne marche pas, tapez cette adresse :</span>
             <span class="secours-url">${escapeHtml(adresseASaisir(ticket.url))}</span>
           </div>`
        : ''
    }
  </div>
</body>
</html>`;

  openPrintWindow(html, { width: 460, height: 760 });
}
