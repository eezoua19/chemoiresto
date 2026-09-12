const QRCodeLib = require('qrcode');
const env = require('../config/env');
const prisma = require('../config/prisma');

/** URL publique encodee dans le QR Code d'une table. */
function buildTableUrl(token) {
  const base = env.frontendUrl.split(',')[0].trim().replace(/\/$/, '');
  return `${base}/menu/table/${token}`;
}

/** Genere l'image PNG (data URL) du QR Code d'une table. */
async function renderDataUrl(token) {
  return QRCodeLib.toDataURL(buildTableUrl(token), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: { dark: '#111827', light: '#FFFFFF' },
  });
}

/**
 * Cree ou met a jour le QR Code d'une table.
 * Incremente la version a chaque regeneration pour tracer les reimpressions.
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

module.exports = { buildTableUrl, renderDataUrl, upsertQRCode };
