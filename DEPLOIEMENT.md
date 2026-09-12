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

## 0. Pousser le projet sur GitHub

Le dépôt Git est déjà initialisé avec un premier commit. Vos fichiers `.env` sont exclus — aucun secret ne partira sur GitHub.

Créez un dépôt **vide** sur https://github.com/new (sans README ni .gitignore), puis :

```bash
git remote add origin https://github.com/VOTRE-COMPTE/chemoiresto.git
git push -u origin main
```

---

## 1 et 2. API + MySQL sur Railway

Railway héberge **la base MySQL et l'API au même endroit** : un seul compte, et la variable de connexion est injectée automatiquement.

### Créer la base

1. https://railway.app → connectez-vous avec GitHub
2. **New Project** → **Provision MySQL**
3. La base est créée avec ses variables (`MYSQL_URL`, `MYSQLHOST`, …)

### Autoriser Railway sur le dépôt (dépôt privé)

Si votre dépôt GitHub est **privé**, Railway ne le voit pas tant que son application GitHub n'y a pas accès. Sans cette étape, le build échoue immédiatement, sans aucun log Docker — le builder est programmé puis abandonne avant même de récupérer la source.

https://github.com/apps/railway-app/installations/new → sélectionnez le dépôt.

Symptôme en ligne de commande :

```
User does not have access to the repo
```

### Créer le service API

1. Dans le même projet : **New** → **GitHub Repo** → sélectionnez votre dépôt
2. **Settings → Root Directory** : `backend`
3. Railway détecte le `Dockerfile` et le `railway.json` (health check sur `/api/health`)

### Variables d'environnement du service API

Onglet **Variables** :

```env
DATABASE_URL=${{MySQL.MYSQL_URL}}
JWT_SECRET=<chaîne aléatoire longue>
NODE_ENV=production
FRONTEND_URL=https://votre-projet.vercel.app
API_URL=https://votre-api.up.railway.app
MAX_UPLOAD_SIZE_MB=5
```

`${{MySQL.MYSQL_URL}}` est une **référence Railway** : tapez-la telle quelle, Railway la remplace par l'URL réelle de votre base. Ne recopiez pas le mot de passe à la main.

Ne définissez **pas** `PORT` : Railway l'injecte lui-même et l'application le lit automatiquement.

Générez le secret :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Volume persistant pour les photos

**Settings → Volumes** → **Add Volume**, point de montage : `/app/uploads`

⚠️ Sans ce volume, toutes les photos des produits disparaissent à chaque redéploiement.

### Exposer l'API

**Settings → Networking** → **Generate Domain**. Vous obtenez `https://votre-api.up.railway.app`.
Reportez cette URL dans la variable `API_URL` ci-dessus.

### Créer les comptes de production

Les migrations Prisma sont appliquées automatiquement au démarrage. Pour créer le restaurant et les comptes, depuis votre machine :

```bash
npm i -g @railway/cli
railway login
railway link
railway run npm run seed --service <nom-du-service-api>
```

Puis **changez immédiatement les mots de passe** depuis _Administration → Serveuses_.

## 3. Frontend sur Vercel

Le fichier `frontend/vercel.json` est déjà configuré : framework Vite, dossier `dist`, et surtout la réécriture monopage — sans elle, rafraîchir `/menu/table/<jeton>` renvoie une 404 et **les QR Codes cessent de fonctionner**.

### Option A — Interface web Vercel (recommandée)

1. https://vercel.com → connectez-vous avec **votre** compte
2. **Add New → Project** → importez le dépôt GitHub de l'étape 0
3. **Root Directory** : `frontend`
4. **Environment Variables** : `VITE_API_URL` = `https://votre-api.up.railway.app`
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

> La CLI Vercel peut échouer avec Node 25 (erreur de résolution de module). Dans ce cas, utilisez l'option A, ou installez Node 20 : `nvm install 20 && nvm use 20`.

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
