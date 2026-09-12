const QRCodeLib = require('qrcode');
const env = require('../config/env');
const prisma = require('../config/prisma');

/** Racine publique du site client, sans barre oblique finale. */
function frontendBase() {
  return env.frontendUrl.split(',')[0].trim().replace(/\/$/, '');
}

/** URL publique encodee dans le QR Code d'une table. */
function buildTableUrl(token) {
  return `${frontendBase()}/menu/table/${token}`;
}

/** URL de l'affiche "a emporter" posee au comptoir. */
function buildTakeawayUrl(token) {
  return `${frontendBase()}/menu/emporter/${token}`;
}

/** Génère l'image PNG (data URL) d'un QR Code à partir de son URL. */
async function renderUrl(url) {
  return QRCodeLib.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: { dark: '#111827', light: '#FFFFFF' },
  });
}

/** Génère l'image PNG (data URL) du QR Code d'une table. */
async function renderDataUrl(token) {
  return renderUrl(buildTableUrl(token));
}

/**
 * Crée ou met à jour le QR Code d'une table.
 * Incremente la version à chaque regeneration pour tracer les reimpressions.
 */
async function upsertQRCode(tableId, token) {
  const url = buildTableUrl(token);
  const dataUrl = await renderDataUrl(token);

  const existing = await prisma.qRCode.findUnique({ where: { tableId } });

  if (existing) {
    return prisma.qRCode.update({
      where: { tableId },
      data: { url, dataUrl, version: existing.version + 1 },
    });
  }

  return prisma.qRCode.create({ data: { tableId, url, dataUrl } });
}

module.exports = {
  buildTableUrl,
  buildTakeawayUrl,
  renderUrl,
  renderDataUrl,
  upsertQRCode,
};
