const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/apiError');

const PRODUCTS_DIR = path.join(env.uploadsDir, 'products');
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PRODUCTS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, name);
  },
});

/** N'accepte que des images, controle du type MIME ET de l'extension. */
function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
    return cb(ApiError.badRequest('Format d\'image non supporte (jpg, png, webp, gif)'));
  }
  return cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.maxUploadSizeMb * 1024 * 1024, files: 1 },
});

/** Supprime physiquement une image produit (chemin relatif stocke en base). */
function removeProductImage(relativePath) {
  if (!relativePath) return;
  const safe = path.basename(relativePath);
  const target = path.join(PRODUCTS_DIR, safe);
  fs.promises.unlink(target).catch(() => {});
}

module.exports = { upload, removeProductImage, PRODUCTS_DIR };
