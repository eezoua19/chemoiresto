import { formatMoney, formatDateTime } from '../../utils/format';
import { openPrintWindow, escapeHtml } from '../print/printWindow';

/**
 * Imprime un ticket de commande.
 *
 * Le ticket est génère dans une fenêtre dédiée, au format 80 mm : c'est le
 * format standard des imprimantes thermiques de caisse. Le même document
 * s'imprime correctement sur une imprimante bureautique classique.
 */
export function printOrderTicket(order, restaurant) {
  const currency = order.currency || restaurant?.currency || 'FCFA';

  const lines = order.items
    .map((item) => {
      const options = item.options.length
        ? `<div class="opt">${item.options.map((option) => escapeHtml(option.valueName)).join(', ')}</div>`
        : '';
      const note = item.note ? `<div class="opt">Note : ${escapeHtml(item.note)}</div>` : '';
      return `
        <tr>
          <td>
            <div class="name">${escapeHtml(item.productName)} x${item.quantity}</div>
            ${options}${note}
          </td>
          <td class="right">${formatMoney(item.lineTotal, currency)}</td>
        </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(order.orderNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Courier New", monospace;
    font-size: 12px;
    color: #000;
    margin: 0 auto;
    max-width: 80mm;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .big { font-size: 16px; font-weight: bold; }
  hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 0; vertical-align: top; }
  .name { font-weight: bold; }
  .opt { font-size: 11px; padding-left: 8px; }
  .total { font-size: 15px; font-weight: bold; }
</style>
</head>
<body>
  <div class="center">
    <div class="big">${escapeHtml(restaurant?.name || 'RESTAURANT')}</div>
    ${restaurant?.address ? `<div>${escapeHtml(restaurant.address)}</div>` : ''}
    ${restaurant?.phone ? `<div>${escapeHtml(restaurant.phone)}</div>` : ''}
  </div>

  <hr />

  <div class="center big">COMMANDE ${escapeHtml(order.orderNumber)}</div>
  ${
    order.type === 'TAKEAWAY'
      ? `<div class="center bold">${order.eatInLater ? 'SUR PLACE' : 'À EMPORTER'}</div>
  <div class="center big">CODE ${escapeHtml(order.pickupCode || '-')}</div>
  ${order.customerPhone ? `<div class="center">${escapeHtml(order.customerPhone)}</div>` : ''}`
      : `<div class="center bold">TABLE ${escapeHtml(order.table?.number || '-')}</div>`
  }
  <div class="center">${formatDateTime(order.createdAt)}</div>

  <hr />

  <table>${lines}</table>

  <hr />

  <table>
    <tr>
      <td class="total">TOTAL</td>
      <td class="right total">${formatMoney(order.total, currency)}</td>
    </tr>
  </table>

  <hr />

  ${order.comment ? `<div>Commentaire : ${escapeHtml(order.comment)}</div>` : ''}
  ${order.customerName ? `<div>Client : ${escapeHtml(order.customerName)}</div>` : ''}
  <div>Serveuse : ${escapeHtml(order.server?.fullName || 'Non attribuée')}</div>

  <hr />
  <div class="center">Merci de votre visite !</div>
</body>
</html>`;

  openPrintWindow(html);
}

/** Feuille d'impression des QR Codes (une fiche par table). */
/**
 * Adresse de secours, a taper si le scan echoue.
 *
 * Seul le protocole est retire : il est inutile a saisir et occupe de la place.
 * Le jeton n'est ni coupe ni espace, même si ce serait plus lisible - ce qui est
 * imprime doit être exactement ce qui se tape, sinon l'adresse ne marche pas.
 */
function adresseASaisir(url) {
  if (!url) return '';
  return String(url).replace(/^https?:\/\//, '');
}

export function printQRCodes(restaurant, tables) {
  const cards = tables
    .map(
      (table) => `
      <div class="card">
        <div class="brand">${escapeHtml(restaurant?.name || 'RESTAURANT')}</div>
        <div class="table">TABLE ${escapeHtml(table.number)}</div>
        <img src="${table.dataUrl}" alt="QR Code table ${escapeHtml(table.number)}" />
        <div class="hint">Ouvrez l'appareil photo et visez le code</div>
        ${
          table.url
            ? `<div class="secours">
                 <span class="secours-titre">Si le scan ne marche pas, tapez cette adresse :</span>
                 <span class="secours-url">${escapeHtml(adresseASaisir(table.url))}</span>
               </div>`
            : ''
        }
      </div>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>QR Codes des tables</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    margin: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8mm;
  }
  .card {
    border: 2px dashed #999;
    border-radius: 8px;
    padding: 8mm 4mm;
    text-align: center;
    page-break-inside: avoid;
  }
  .brand { font-size: 13px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; }
  .table { font-size: 26px; font-weight: 800; margin: 4mm 0; }
  .card img { width: 48mm; height: 48mm; }
  .hint { margin-top: 3mm; font-size: 12px; color: #444; }
  /* Adresse de secours : lisible, mais discrete face au QR Code. */
  .secours {
    margin-top: 3mm;
    padding-top: 2.5mm;
    border-top: 1px solid #ddd;
  }
  .secours-titre { display: block; font-size: 9px; color: #777; }
  .secours-url {
    display: block;
    margin-top: 1mm;
    font-family: "Courier New", monospace;
    font-size: 9.5px;
    color: #222;
    word-break: break-all;
  }
</style>
</head>
<body>${cards}</body>
</html>`;

  openPrintWindow(html);
}

/**
 * Affiche à poser au comptoir pour la vente à emporter.
 *
 * Une seule page, un seul code : contrairement aux tables, il n'y a rien a
 * distinguer. Le QR occupe la moitie de la feuille pour se scanner de loin,
 * et l'adresse de secours reste imprimee dessous comme pour les tables.
 */
export function printTakeawayPoster(restaurant, takeaway) {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Commandes à emporter</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    margin: 0;
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 260mm;
  }
  .brand { font-size: 20px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; }
  .titre { font-size: 40px; font-weight: 800; margin: 6mm 0 2mm; }
  .sous-titre { font-size: 16px; color: #444; margin-bottom: 8mm; }
  img { width: 110mm; height: 110mm; }
  .etapes {
    margin: 8mm auto 0;
    max-width: 130mm;
    text-align: left;
    font-size: 14px;
    line-height: 1.7;
    color: #222;
  }
  .secours { margin-top: 8mm; padding-top: 4mm; border-top: 1px solid #ddd; }
  .secours-titre { display: block; font-size: 11px; color: #777; }
  .secours-url {
    display: block;
    margin-top: 2mm;
    font-family: "Courier New", monospace;
    font-size: 12px;
    color: #222;
    word-break: break-all;
  }
</style>
</head>
<body>
  <div class="brand">${escapeHtml(restaurant?.name || 'RESTAURANT')}</div>
  <div class="titre">À EMPORTER</div>
  <div class="sous-titre">Commandez depuis votre téléphone</div>

  <img src="${takeaway?.qrDataUrl || ''}" alt="QR Code des commandes à emporter" />

  <div class="etapes">
    1. Ouvrez l'appareil photo et visez le code<br />
    2. Choisissez vos plats et validez<br />
    3. Un code de retrait s'affiche : montrez-le au comptoir
  </div>

  ${
    takeaway?.url
      ? `<div class="secours">
           <span class="secours-titre">Si le scan ne marche pas, tapez cette adresse :</span>
           <span class="secours-url">${escapeHtml(adresseASaisir(takeaway.url))}</span>
         </div>`
      : ''
  }
</body>
</html>`;

  openPrintWindow(html);
}
