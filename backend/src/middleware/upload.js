const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const env = require('../config/env');
const ApiError = require('../utils/apiError');

const PRODUCTS_DIR = path.join(env.uploadsDir, 'products');
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/**
 * Un plat s'affiche au plus grand dans sa fiche, sur un telephone : 1000 px de
 * cote couvrent large, y compris les ecrans a haute densite. Au-dela, on ne
 * transporte que des pixels que personne ne voit.
 */
const COTE_MAX = 1000;
const QUALITE_WEBP = 78;

fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

// Le fichier reste en memoire : on ne veut pas ecrire l'original brut sur le
// disque pour le relire aussitot, on le traite directement depuis le tampon.
const storage = multer.memoryStorage();

/** N'accepté que des images, contrôle du type MIME ET de l'extension. */
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

function nomFichier(extension) {
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
}

/**
 * Recompresse l'image envoyee : redimensionnee et convertie en WebP, elle pese
 * couramment cinq a vingt fois moins qu'une photo prise au telephone, sans
 * difference visible sur une carte de menu. La carte du client s'en trouve
 * d'autant plus rapide a charger.
 *
 * A placer juste apres `upload.single(...)`. Les controleurs lisent ensuite
 * `req.file.filename` sans rien changer : le chemin `/uploads/products/<nom>`
 * pointe simplement vers un `.webp`.
 */
async function optimiserImage(req, _res, next) {
  if (!req.file) return next();

  try {
    // Une image animee (GIF) perdrait ses images si on la traitait page a page ;
    // on la lit en entier pour la reconvertir en WebP anime. La rotation EXIF,
    // elle, n'a de sens que sur une photo fixe.
    const meta = await sharp(req.file.buffer).metadata();
    const animee = (meta.pages || 1) > 1;

    let pipeline = sharp(req.file.buffer, { animated: animee });
    if (!animee) pipeline = pipeline.rotate();

    const optimisee = await pipeline
      .resize(COTE_MAX, COTE_MAX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITE_WEBP })
      .toBuffer();

    const nom = nomFichier('.webp');
    await fs.promises.writeFile(path.join(PRODUCTS_DIR, nom), optimisee);
    req.file.filename = nom;
    req.file.path = path.join(PRODUCTS_DIR, nom);
    req.file.mimetype = 'image/webp';
    return next();
  } catch {
    // L'optimisation a echoue (fichier illisible, format inattendu) : plutot
    // que de refuser l'upload, on ecrit l'original tel quel. Le pire cas est
    // une image non optimisee, jamais une image perdue.
    try {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const nom = nomFichier(ext);
      await fs.promises.writeFile(path.join(PRODUCTS_DIR, nom), req.file.buffer);
      req.file.filename = nom;
      req.file.path = path.join(PRODUCTS_DIR, nom);
      return next();
    } catch (erreurEcriture) {
      return next(erreurEcriture);
    }
  }
}

/** Supprime physiquement une image produit (chemin relatif stocke en base). */
function removeProductImage(relativePath) {
  if (!relativePath) return;
  const safe = path.basename(relativePath);
  const target = path.join(PRODUCTS_DIR, safe);
  fs.promises.unlink(target).catch(() => {});
}

module.exports = { upload, optimiserImage, removeProductImage, PRODUCTS_DIR };
