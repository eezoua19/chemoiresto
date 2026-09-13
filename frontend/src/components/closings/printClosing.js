import { openPrintWindow, escapeHtml } from '../print/printWindow';
import { formatLongDate } from '../../utils/format';

const montant = (valeur, devise) => `${Math.round(Number(valeur) || 0).toLocaleString('fr-FR')} ${devise}`;

/**
 * Feuille de caisse d'une journée.
 *
 * Pensée pour être posée à côté de la caisse le soir : les chiffres qu'on
 * vérifie en premier sont en haut et en gros, le détail suit. Format A5 pour
 * tenir dans un classeur.
 */
export function printClosing(cloture, restaurant) {
  const devise = restaurant?.currency || 'FCFA';

  const plats = (cloture.topProducts || [])
    .map(
      (plat) => `<tr>
        <td>${escapeHtml(plat.name)}</td>
        <td class="nombre">x${plat.quantity}</td>
        <td class="nombre">${montant(plat.revenue, devise)}</td>
      </tr>`
    )
    .join('');

  const service = (cloture.servers || [])
    .map(
      (personne) => `<tr>
        <td>${escapeHtml(personne.name)}</td>
        <td class="nombre">${personne.orders}</td>
        <td class="nombre">${montant(personne.revenue, devise)}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Clôture ${escapeHtml(cloture.date)}</title>
<style>
  @page { size: A5; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #111; font-size: 12px; }
  .marque { font-size: 11px; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase; }
  h1 { font-size: 16px; margin: 2mm 0 1mm; }
  .jour { font-size: 13px; font-weight: bold; }
  .provisoire {
    margin: 3mm 0; padding: 2mm 3mm; border: 1px solid #b45309;
    color: #b45309; font-weight: bold; font-size: 11px;
  }
  .recette {
    margin: 4mm 0; padding: 4mm; border: 2px solid #111; text-align: center;
  }
  .recette .valeur { font-size: 26px; font-weight: 800; letter-spacing: 0.5px; }
  .recette .libelle { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
       border-bottom: 1px solid #111; padding: 1.5mm 0; }
  td { padding: 1.5mm 0; border-bottom: 1px solid #eee; }
  .nombre { text-align: right; white-space: nowrap; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 5mm 0 1mm; }
  .pied { margin-top: 6mm; border-top: 1px solid #ccc; padding-top: 2mm;
          font-size: 10px; color: #555; display: flex; justify-content: space-between; }
  .signature { margin-top: 8mm; font-size: 11px; }
  .ligne { display: inline-block; width: 55mm; border-bottom: 1px solid #111; margin-left: 2mm; }
</style>
</head>
<body>
  <div class="marque">${escapeHtml(restaurant?.name || 'CHEMOIRESTO')}</div>
  <h1>Clôture de journée</h1>
  <div class="jour">${escapeHtml(formatLongDate(cloture.date))}</div>

  ${
    cloture.closed
      ? ''
      : '<div class="provisoire">Journée non arrêtée : chiffres provisoires</div>'
  }

  <div class="recette">
    <div class="libelle">Recette de la journée</div>
    <div class="valeur">${montant(cloture.revenue, devise)}</div>
  </div>

  <table>
    <tr><td>Commandes encaissées</td><td class="nombre">${cloture.ordersCount}</td></tr>
    <tr><td>Commandes annulées</td><td class="nombre">${cloture.cancelledCount}</td></tr>
    <tr><td>Panier moyen</td><td class="nombre">${montant(cloture.averageTicket, devise)}</td></tr>
    <tr><td>En salle</td><td class="nombre">${montant(cloture.dineInRevenue, devise)}</td></tr>
    <tr><td>À emporter</td><td class="nombre">${montant(cloture.takeawayRevenue, devise)}</td></tr>
    <tr><td>Passages d'abonnés</td><td class="nombre">${cloture.subscriptionUsages}</td></tr>
    ${
      cloture.peakHour === null || cloture.peakHour === undefined
        ? ''
        : `<tr><td>Heure de pointe</td><td class="nombre">${cloture.peakHour} h</td></tr>`
    }
  </table>

  ${
    plats
      ? `<h2>Plats les plus vendus</h2>
         <table>
           <tr><th>Plat</th><th class="nombre">Qté</th><th class="nombre">Total</th></tr>
           ${plats}
         </table>`
      : ''
  }

  ${
    service
      ? `<h2>Service</h2>
         <table>
           <tr><th>Serveuse</th><th class="nombre">Cmd</th><th class="nombre">Total</th></tr>
           ${service}
         </table>`
      : ''
  }

  <div class="signature">Vérifié par <span class="ligne"></span></div>

  <div class="pied">
    <span>CHEMOIRESTO</span>
    <span>Imprimé le ${new Date().toLocaleDateString('fr-FR')}</span>
  </div>
</body>
</html>`;

  openPrintWindow(html, { width: 460, height: 760 });
}
