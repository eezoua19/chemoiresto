const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { optimiserImage, PRODUCTS_DIR } = require('../src/middleware/upload');

/** Invoque le middleware et resout avec l'erreur passee a next (ou null). */
function lancer(file) {
  const req = { file };
  return new Promise((resolve) => {
    optimiserImage(req, {}, (erreur) => resolve({ req, erreur }));
  });
}

function nettoyer(filename) {
  // Sous Windows/OneDrive, un verrou de synchro peut retarder la suppression
  // juste apres l'ecriture : on laisse quelques essais plutot que d'echouer.
  if (filename) {
    fs.rmSync(path.join(PRODUCTS_DIR, filename), { force: true, maxRetries: 5, retryDelay: 100 });
  }
}

test('Optimisation des images à l\'upload', async (suite) => {
  await suite.test('une photo volumineuse est réduite et convertie en WebP', async () => {
    // Une image détaillée : un aplat se compresserait à quelques octets et ne
    // prouverait pas le redimensionnement. Le bruit force un vrai volume.
    const source = await sharp({
      create: {
        width: 3000,
        height: 2000,
        channels: 3,
        noise: { type: 'gaussian', mean: 128, sigma: 60 },
      },
    })
      .jpeg({ quality: 100 })
      .toBuffer();

    const { req, erreur } = await lancer({ buffer: source, originalname: 'plat.jpg' });

    assert.equal(erreur, undefined, 'aucune erreur ne doit remonter');
    assert.ok(req.file.filename.endsWith('.webp'), 'le fichier écrit doit être un .webp');
    assert.equal(req.file.mimetype, 'image/webp');

    // On lit le fichier en memoire puis on inspecte le tampon : passer le
    // chemin a sharp le garderait ouvert et bloquerait la suppression sous
    // Windows.
    const ecrit = fs.readFileSync(path.join(PRODUCTS_DIR, req.file.filename));
    try {
      const meta = await sharp(ecrit).metadata();
      assert.equal(meta.format, 'webp');
      assert.ok(
        meta.width <= 1000 && meta.height <= 1000,
        `dimensions ramenées sous 1000 px (obtenu ${meta.width}x${meta.height})`
      );
      assert.ok(
        ecrit.length < source.length / 2,
        `le poids doit fortement baisser (${source.length} -> ${ecrit.length} octets)`
      );
    } finally {
      nettoyer(req.file.filename);
    }
  });

  await suite.test('une image déjà petite n\'est pas agrandie', async () => {
    const source = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 220, g: 90, b: 40 } },
    })
      .png()
      .toBuffer();

    const { req, erreur } = await lancer({ buffer: source, originalname: 'logo.png' });
    assert.equal(erreur, undefined);

    const ecrit = fs.readFileSync(path.join(PRODUCTS_DIR, req.file.filename));
    try {
      const meta = await sharp(ecrit).metadata();
      assert.equal(meta.width, 200, 'la largeur d\'origine est conservée');
      assert.equal(meta.height, 200);
    } finally {
      nettoyer(req.file.filename);
    }
  });

  await suite.test('un fichier illisible est conservé tel quel plutôt que perdu', async () => {
    // Extension d'image mais contenu qui n'en est pas une : sharp échoue, le
    // repli doit écrire l'original sans faire échouer la requête.
    const source = Buffer.from('ceci n\'est pas une image');

    const { req, erreur } = await lancer({ buffer: source, originalname: 'casse.jpg' });

    assert.equal(erreur, undefined, 'le repli ne doit pas propager d\'erreur');
    assert.ok(req.file.filename.endsWith('.jpg'), 'l\'extension d\'origine est conservée');

    try {
      const ecrit = fs.readFileSync(path.join(PRODUCTS_DIR, req.file.filename));
      assert.deepEqual(ecrit, source, 'le contenu original est écrit intact');
    } finally {
      nettoyer(req.file.filename);
    }
  });

  await suite.test('sans fichier, le middleware passe la main', async () => {
    const { erreur } = await lancer(undefined);
    assert.equal(erreur, undefined);
  });
});
