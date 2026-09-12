import { formatMoney, formatDateTime } from '../../utils/format';

/**
 * Imprime un ticket de commande.
 *
 * Le ticket est genere dans une fenetre dediee, au format 80 mm : c'est le
 * format standard des imprimantes thermiques de caisse. Le meme document
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
  <div class="center bold">TABLE ${escapeHtml(order.table?.number || '-')}</div>
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
  <div>Serveuse : ${escapeHtml(order.server?.fullName || 'Non attribuee')}</div>

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
 * Le jeton n'est ni coupe ni espace, meme si ce serait plus lisible - ce qui est
 * imprime doit etre exactement ce qui se tape, sinon l'adresse ne marche pas.
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

function openPrintWindow(html) {
  const printWindow = window.open('', '_blank', 'width=420,height=700');
  if (!printWindow) {
    // Le navigateur a bloque la fenetre : on informe l'appelant.
    throw new Error('Autorisez les fenetres surgissantes pour imprimer');
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  // Laisse le temps aux images de se charger avant d'ouvrir la boite d'impression.
  setTimeout(() => {
    printWindow.print();
  }, 400);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
