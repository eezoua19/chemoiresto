const PDFDocument = require('pdfkit');
const { formatDate } = require('../utils/helpers');

/**
 * Export comptable PDF : un recapitulatif journalier plus les totaux et le
 * detail (plats, serveuses) agrege sur toute la periode - ce qu'un
 * comptable demande d'habitude en un seul document, pas dix.
 *
 * Construit uniquement a partir des journees deja cloturees (DailyClosing) :
 * une journee non figee pourrait encore bouger, un document comptable non.
 */

const MARQUE = '#E4572E';
const TEXTE = '#1f2430';
const GRIS = '#6b7280';
const CLAIR = '#f7f7f9';

/** "2026-03-10" -> "10/03/2026" : un document comptable se lit en francais. */
function enFrancais(iso) {
  const [annee, mois, jour] = String(iso).slice(0, 10).split('-');
  return jour ? `${jour}/${mois}/${annee}` : String(iso);
}

function montant(valeur, devise) {
  return `${Math.round(Number(valeur) || 0).toLocaleString('fr-FR')} ${devise}`;
}

const COLONNES = [
  { titre: 'Date', largeur: 65 },
  { titre: 'Commandes', largeur: 62 },
  { titre: 'Annulées', largeur: 55 },
  { titre: 'Salle', largeur: 95 },
  { titre: 'Emporter', largeur: 95 },
  { titre: 'Total', largeur: 95 },
];

function ligneEntete(doc, x, y) {
  const largeurTotale = COLONNES.reduce((somme, colonne) => somme + colonne.largeur, 0);
  doc.rect(x, y, largeurTotale, 18).fill(MARQUE);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  let curseur = x;
  COLONNES.forEach((colonne) => {
    doc.text(colonne.titre, curseur + 4, y + 5, { width: colonne.largeur - 8 });
    curseur += colonne.largeur;
  });
}

/**
 * Genere le PDF et l'envoie directement dans la reponse HTTP (deja
 * configuree avec les en-tetes Content-Type/Content-Disposition par
 * l'appelant). Rien n'est retourne : le flux se termine avec `doc.end()`.
 */
function genererPdfComptable(res, { restaurant, from, to, closings }) {
  const devise = restaurant?.currency || 'FCFA';
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(res);

  // ---- En-tete --------------------------------------------------------
  doc.fontSize(18).fillColor(MARQUE).font('Helvetica-Bold').text(restaurant?.name || 'Restaurant');
  doc.fontSize(13).fillColor(TEXTE).text('Récapitulatif comptable');
  doc
    .fontSize(10)
    .fillColor(GRIS)
    .font('Helvetica')
    .text(
      `Période du ${enFrancais(formatDate(from))} au ${enFrancais(formatDate(to))} — généré le ${enFrancais(
        formatDate(new Date())
      )}`
    );
  doc.moveDown(1);

  if (closings.length === 0) {
    doc.fontSize(11).fillColor(TEXTE).text('Aucune journée clôturée sur cette période.');
    doc.end();
    return;
  }

  // ---- Totaux -----------------------------------------------------------
  const totaux = closings.reduce(
    (acc, jour) => ({
      revenue: acc.revenue + jour.revenue,
      orders: acc.orders + jour.ordersCount,
      cancelled: acc.cancelled + jour.cancelledCount,
      dineIn: acc.dineIn + jour.dineInRevenue,
      takeaway: acc.takeaway + jour.takeawayRevenue,
    }),
    { revenue: 0, orders: 0, cancelled: 0, dineIn: 0, takeaway: 0 }
  );
  const panierMoyen = totaux.orders ? Math.round(totaux.revenue / totaux.orders) : 0;

  const resume = [
    ['Journées avec service', String(closings.length)],
    ['Commandes', String(totaux.orders)],
    ['Commandes annulées', String(totaux.cancelled)],
    ["Chiffre d'affaires en salle", montant(totaux.dineIn, devise)],
    ["Chiffre d'affaires à emporter", montant(totaux.takeaway, devise)],
    ["Chiffre d'affaires total", montant(totaux.revenue, devise)],
    ['Panier moyen', montant(panierMoyen, devise)],
  ];
  doc.fontSize(11);
  resume.forEach(([label, valeur]) => {
    doc
      .font('Helvetica-Bold')
      .fillColor(TEXTE)
      .text(`${label} : `, { continued: true })
      .font('Helvetica')
      .text(valeur);
  });
  doc.moveDown(1);

  // ---- Tableau journalier -------------------------------------------------
  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXTE).text('Détail par journée');
  doc.moveDown(0.3);

  const x = doc.page.margins.left;
  const basPage = doc.page.height - doc.page.margins.bottom;
  let y = doc.y;

  ligneEntete(doc, x, y);
  y += 18;

  closings.forEach((jour, index) => {
    if (y > basPage - 20) {
      doc.addPage();
      y = doc.page.margins.top;
      ligneEntete(doc, x, y);
      y += 18;
    }

    if (index % 2 === 0) {
      const largeurTotale = COLONNES.reduce((somme, colonne) => somme + colonne.largeur, 0);
      doc.rect(x, y, largeurTotale, 16).fill(CLAIR);
    }

    doc.fillColor(TEXTE).font('Helvetica').fontSize(9);
    const valeurs = [
      enFrancais(jour.date),
      String(jour.ordersCount),
      String(jour.cancelledCount),
      montant(jour.dineInRevenue, devise),
      montant(jour.takeawayRevenue, devise),
      montant(jour.revenue, devise),
    ];
    let curseur = x;
    valeurs.forEach((valeur, i) => {
      doc.text(valeur, curseur + 4, y + 4, { width: COLONNES[i].largeur - 8 });
      curseur += COLONNES[i].largeur;
    });
    y += 16;
  });

  doc.y = y + 10;

  // ---- Plats les plus vendus sur la periode ------------------------------
  const parPlat = new Map();
  closings.forEach((jour) => {
    (jour.topProducts || []).forEach((plat) => {
      const entree = parPlat.get(plat.name) || { quantity: 0, revenue: 0 };
      entree.quantity += plat.quantity;
      entree.revenue += plat.revenue;
      parPlat.set(plat.name, entree);
    });
  });
  const topPlats = [...parPlat.entries()]
    .map(([name, valeurs]) => ({ name, ...valeurs }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  if (topPlats.length > 0) {
    if (doc.y > basPage - 100) doc.addPage();
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXTE).text('Plats les plus vendus sur la période');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9);
    topPlats.forEach((plat) => {
      doc.text(`${plat.name} — x${plat.quantity} — ${montant(plat.revenue, devise)}`);
    });
  }

  // ---- Performance par serveuse sur la periode ---------------------------
  const parServeuse = new Map();
  closings.forEach((jour) => {
    (jour.servers || []).forEach((personne) => {
      const entree = parServeuse.get(personne.name) || { orders: 0, revenue: 0 };
      entree.orders += personne.orders;
      entree.revenue += personne.revenue;
      parServeuse.set(personne.name, entree);
    });
  });
  const topServeuses = [...parServeuse.entries()]
    .map(([name, valeurs]) => ({ name, ...valeurs }))
    .sort((a, b) => b.revenue - a.revenue);

  if (topServeuses.length > 0) {
    if (doc.y > basPage - 100) doc.addPage();
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXTE).text('Performance par serveuse sur la période');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9);
    topServeuses.forEach((personne) => {
      doc.text(`${personne.name} — ${personne.orders} commande(s) — ${montant(personne.revenue, devise)}`);
    });
  }

  doc.end();
}

module.exports = { genererPdfComptable };
