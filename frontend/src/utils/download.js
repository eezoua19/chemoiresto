/**
 * Telechargement d'un fichier recu de l'API.
 *
 * Un simple lien ne suffit pas : les routes de sauvegarde exigent le jeton
 * d'authentification, que le navigateur n'enverrait pas sur une navigation
 * ordinaire. On recupere donc le contenu par l'API, puis on le remet au
 * navigateur sous forme de fichier.
 */
export function telechargerFichier(contenu, nom) {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);

  // Sans cette liberation, le fichier reste en memoire tant que l'onglet vit.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
