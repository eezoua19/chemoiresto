# Déploiement

## Pourquoi le projet ne tient pas entièrement sur Vercel

Vercel exécute des **fonctions serverless** : un processus démarre à la requête, répond, puis meurt. Trois briques de cette application sont incompatibles avec ce modèle.

| Brique | Vercel | Raison |
|---|---|---|
| Frontend React / Vite | ✅ | Fichiers statiques — c'est exactement l'usage prévu |
| API REST Express | ⚠️ | Techniquement possible, mais inséparable des deux lignes suivantes |
| **Socket.IO (temps réel)** | ❌ | Une WebSocket a besoin d'un processus **persistant**. Sans lui : plus de commande qui arrive chez la serveuse, plus de suivi client en direct, plus d'alerte sonore |
| **MySQL** | ❌ | Vercel n'héberge pas de base de données |
| **Images des produits** | ❌ | Système de fichiers éphémère : les photos uploadées disparaissent au redéploiement |

Le temps réel est le cœur du produit. Déployer l'API sur Vercel donnerait une application qui **paraît** fonctionner mais où la serveuse ne reçoit plus rien.

## L'architecture de déploiement

```
  Client / Serveuse / Admin
            │
            ▼
   ┌────────────────┐        ┌──────────────────────┐
   │    VERCEL      │──API──▶│  Hébergeur Node      │
   │   Frontend     │  +WS   │  API + Socket.IO     │
   │  (statique)    │◀───────│  + volume /uploads   │
   └────────────────┘        └──────────┬───────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │  MySQL managé    │
                              └──────────────────┘
```

Trois services. Vercel n'en couvre qu'un — le bon, celui pour lequel il est fait.

---

## 1. Base de données MySQL

Votre base XAMPP tourne sur votre machine : elle n'est pas joignable depuis Internet. Il faut une base managée.

Options gratuites ou peu coûteuses : **Railway**, **Aiven**, **Clever Cloud**, **PlanetScale**, ou une base MySQL chez votre hébergeur habituel.

Récupérez l'URL de connexion, au format :

```
mysql://utilisateur:motdepasse@hote:3306/nom_de_la_base
```

## 2. Backend (API + Socket.IO)

Un `Dockerfile` est fourni dans `backend/`. Il fonctionne tel quel sur **Render**, **Railway**, **Fly.io**, **Clever Cloud** ou un VPS.

Variables d'environnement à définir sur l'hébergeur :

```env
DATABASE_URL=mysql://...            # la base de l'étape 1
JWT_SECRET=<chaîne aléatoire longue>
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://votre-projet.vercel.app
API_URL=https://votre-api.onrender.com
MAX_UPLOAD_SIZE_MB=5
```

Générez le secret :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

⚠️ **Montez un volume persistant sur `/app/uploads`**, sinon les photos des produits sont perdues à chaque redéploiement.

Les migrations Prisma sont appliquées automatiquement au démarrage (`prisma migrate deploy`).

Créez ensuite les comptes de production :

```bash
npm run seed
```

puis **changez immédiatement les mots de passe** depuis _Administration → Serveuses_.

## 3. Frontend sur Vercel

Le fichier `frontend/vercel.json` est déjà configuré : framework Vite, dossier `dist`, et surtout la réécriture monopage — sans elle, rafraîchir `/menu/table/<jeton>` renvoie une 404 et **les QR Codes cessent de fonctionner**.

### Option A — Interface web Vercel (recommandée)

1. Poussez le projet sur GitHub
2. https://vercel.com → **Add New → Project** → importez le dépôt
3. **Root Directory** : `frontend`
4. **Environment Variables** : `VITE_API_URL` = `https://votre-api.onrender.com`
5. **Deploy**

Chaque `git push` redéploie automatiquement.

### Option B — Ligne de commande

```bash
cd frontend
npx vercel login
npx vercel link
npx vercel env add VITE_API_URL production
npx vercel --prod
```

> `VITE_API_URL` est lue **au moment du build**, pas à l'exécution. Après l'avoir modifiée, il faut redéployer pour que le changement prenne effet.

## 4. Après le premier déploiement — à ne pas oublier

1. **Renseignez `FRONTEND_URL`** côté backend avec l'URL Vercel réelle, puis redémarrez l'API (CORS + URL encodée dans les QR Codes).
2. **Régénérez tous les QR Codes** depuis _Administration → Tables_ : ceux générés en local pointent vers `localhost` et ne fonctionneront jamais sur un téléphone.
3. Réimprimez et remplacez les QR Codes sur les tables.
4. Vérifiez le temps réel : passez une commande depuis un téléphone, elle doit apparaître chez la serveuse sans rafraîchissement.

## 5. Vérification

```bash
curl https://votre-api.onrender.com/api/health
```

Réponse attendue :

```json
{ "success": true, "message": "API operationnelle", "data": { "time": "..." } }
```

## Coût indicatif

| Service | Offre gratuite |
|---|---|
| Vercel (frontend) | Oui, largement suffisante |
| Render / Railway (API) | Oui, mais l'instance s'endort après inactivité — premier scan lent |
| MySQL managé | Oui, avec quotas |

Pour un vrai restaurant, une petite offre payante sur l'API (≈ 7 $/mois) évite l'endormissement : un client qui scanne un QR Code ne doit pas attendre 30 secondes.
