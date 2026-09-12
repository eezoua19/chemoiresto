# Menu digital par QR Code — Commande à table

Application web complète pour restaurant, maquis, bar ou lounge.
Le client scanne le QR Code posé sur sa table, consulte le **menu du jour**, commande
depuis son téléphone, et la commande arrive **instantanément** chez la serveuse.

```
QR CODE → TABLE → MENU DU JOUR → PANIER → COMMANDE → SERVEUSE → TEMPS RÉEL → CLIENT
```

---

## 1. Présentation

Trois interfaces dans une seule application :

| Rôle | Accès | Ce qu'il peut faire |
|---|---|---|
| **Client** | Scan du QR Code, aucun compte | Voir le menu du jour, commander, suivre sa commande en direct, appeler une serveuse, demander l'addition |
| **Serveuse** | `/login` | Recevoir les commandes en temps réel (avec alerte sonore), les faire avancer, traiter les demandes clients |
| **Administrateur** | `/login` | Tout gérer : menus quotidiens, produits, catégories, tables, QR Codes, serveuses, commandes, historique, statistiques, paramètres |

---

## 2. Fonctionnalités

### Côté client (mobile-first)
- Identification automatique de la table via un **jeton aléatoire** contenu dans le QR Code
- Menu du jour correspondant à la **date réelle**, avec catégories et plats du jour
- Fiche produit avec **options** (choix unique) et **suppléments** (choix multiple), prix recalculé en direct
- Panier persistant (par table), modification des quantités, suppression, vidage
- Commande avec nom et commentaire facultatifs
- Numéro de commande lisible : `CMD-20260912-0042`
- **Suivi en temps réel** : Reçue → Acceptée → En préparation → Prête → Servie
- Bouton « Appeler une serveuse » et « Demander l'addition » (avec anti-spam)
- Produits marqués indisponibles : visibles mais non commandables

### Côté serveuse
- Tableau **Kanban** temps réel (Nouvelles / Acceptées / En préparation / Prêtes)
- Notification sonore et toast à chaque nouvelle commande
- Avancement du statut en un clic, annulation
- Impression du ticket de commande
- Liste filtrable des commandes, demandes clients

### Côté administrateur
- **Calendrier mensuel des menus** : 🟢 menu configuré / 🔴 aucun menu
- Éditeur de menu par date : sélection des produits, **prix du jour**, description du jour, plat du jour, disponibilité, ordre
- **Copie d'un menu** vers une autre date (le menu source reste intact)
- Produits : CRUD complet, image, catégorie (créable à la volée), options et suppléments, disponibilité instantanée
- **Mise au menu du jour en un clic** depuis la fiche produit : le plat devient immédiatement commandable par les clients, sans passer par le calendrier
- Catégories : CRUD + réordonnancement
- Tables : CRUD, activation/désactivation, génération et **régénération** du QR Code
- QR Codes : consultation, téléchargement PNG, impression unitaire ou **de tous les QR Codes** (format A4)
- Serveuses : CRUD, réinitialisation de mot de passe, consultation de l'activité
- Commandes : suivi en direct, **attribution / réattribution** à une serveuse, impression
- Historique : filtres (aujourd'hui, hier, semaine, mois, période personnalisée, table, serveuse, statut) + recherche
- Statistiques : commandes/jour, chiffre d'affaires, produits les plus commandés, catégories populaires, performance des serveuses
- Paramètres : nom, logo, description, adresse, téléphone, email, devise, horaires, **couleur principale**, message d'accueil

### Transverse
- **Historique des prix** : le prix appliqué est figé au moment de la commande. Changer le prix d'un produit ne modifie jamais les commandes passées.
- **Architecture multi-restaurant** : toutes les données sont rattachées à un restaurant.
- États gérés partout : chargement (skeletons), succès, erreur, vide, hors-ligne, non autorisé, introuvable.

---

## 3. Architecture

```
CHEMOIRESTO/
│
├── backend/
│   ├── src/
│   │   ├── config/          env.js, prisma.js
│   │   ├── controllers/     logique des routes
│   │   ├── middleware/      auth, rôles, validation, upload, rate limit, erreurs
│   │   ├── routes/          définition des routes REST
│   │   ├── services/        métier : commandes, menus, QR Codes, notifications
│   │   ├── sockets/         Socket.IO (salons personnel / table / commande)
│   │   ├── utils/           helpers, erreurs, format de réponse
│   │   ├── validators/      schémas Zod
│   │   ├── app.js           application Express
│   │   └── server.js        démarrage HTTP + Socket.IO
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.js
│   ├── tests/
│   ├── uploads/products/    images des produits et logos
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── components/      UI réutilisable, client, commandes
    │   ├── context/         Auth, Panier, Toasts
    │   ├── hooks/           Socket.IO, son de notification
    │   ├── layouts/         AdminLayout, ServerLayout
    │   ├── pages/           client / server / admin
    │   ├── services/        Axios, endpoints, Socket.IO
    │   ├── utils/           format, constantes, couleurs
    │   ├── App.jsx
    │   └── main.jsx
    ├── index.html
    ├── tailwind.config.js
    ├── vite.config.js
    └── .env.example
```

---

## 4. Technologies

**Frontend** — React 18, Vite 5, Tailwind CSS 3, React Router 6, Axios, Lucide React, Recharts, Socket.IO Client
**Backend** — Node.js, Express 4, Socket.IO 4, JWT, bcryptjs, Zod, Multer, qrcode, Helmet, express-rate-limit
**Base de données** — MySQL / MariaDB, ORM **Prisma 5**

---

## 5. Installation

### Prérequis
- **Node.js 18 ou plus** — https://nodejs.org
- **MySQL ou MariaDB** en cours d'exécution

Vérifiez votre installation :

```bash
node --version
npm --version
```

### Étape 1 — Récupérer le projet

Placez-vous dans le dossier du projet (celui qui contient `backend/` et `frontend/`).

---

## 6. Configuration MySQL

Vous avez besoin d'un serveur MySQL démarré et d'une base de données vide.

### Option A — XAMPP (Windows, le plus simple)
1. Ouvrez le **XAMPP Control Panel**
2. Cliquez sur **Start** en face de **MySQL**
3. Cliquez sur **Admin** (phpMyAdmin s'ouvre)
4. Onglet **Bases de données** → nom : `qr_menu` → interclassement `utf8mb4_unicode_ci` → **Créer**

Identifiants XAMPP par défaut : utilisateur `root`, **mot de passe vide**.

### Option B — Laragon
Démarrez Laragon, cliquez sur **Démarrer tout**, puis **Base de données** pour créer `qr_menu`.

### Option C — Ligne de commande

```bash
mysql -u root -p -e "CREATE DATABASE qr_menu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### Option D — MySQL Workbench
Connectez-vous, puis exécutez la requête ci-dessus dans un nouvel onglet SQL.

> Le projet ne dépend d'aucun de ces logiciels : n'importe quel serveur MySQL 5.7+ ou MariaDB 10.4+ convient.

---

## 7. Fichiers `.env`

### Backend

```bash
cd backend
cp .env.example .env
```

Sous Windows (PowerShell) : `Copy-Item .env.example .env`

Ouvrez `backend/.env` et adaptez :

```env
DATABASE_URL="mysql://root:@127.0.0.1:3306/qr_menu"
PORT=4000
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"
API_URL="http://localhost:4000"
JWT_SECRET="une-chaine-aleatoire-tres-longue"
JWT_EXPIRES_IN="12h"
MAX_UPLOAD_SIZE_MB=5
```

**`DATABASE_URL`** suit le format `mysql://UTILISATEUR:MOT_DE_PASSE@HÔTE:PORT/BASE`.
Avec un mot de passe : `mysql://root:monMotDePasse@127.0.0.1:3306/qr_menu`.

**Générez un vrai `JWT_SECRET`** :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Frontend

```bash
cd frontend
cp .env.example .env
```

```env
VITE_API_URL=http://localhost:4000
```

---

## 8. Prisma

Prisma génère le client d'accès à la base à partir de `prisma/schema.prisma`.

```bash
cd backend
npm install
npx prisma generate
```

---

## 9. Migration

Crée toutes les tables dans MySQL :

```bash
cd backend
npx prisma migrate dev
```

Pour inspecter la base visuellement :

```bash
npx prisma studio
```

---

## 10. Seed (données de développement)

```bash
cd backend
npm run seed
```

Le seed crée : 1 restaurant, 1 administrateur, 1 serveuse, 6 catégories, 12 produits,
6 tables avec leurs QR Codes, et **le menu du jour**.

Il est **idempotent** : le relancer ne duplique rien. Relancez-le le lendemain pour
créer automatiquement le menu du nouveau jour (ou créez-le depuis l'administration).

---

## 11. Lancement

Ouvrez **deux terminaux**.

**Terminal 1 — backend :**

```bash
cd backend
npm run dev
```

→ API sur http://localhost:4000

**Terminal 2 — frontend :**

```bash
cd frontend
npm install
npm run dev
```

→ Application sur http://localhost:5173

### Tester depuis un vrai téléphone

Vite affiche une adresse « Network » du type `http://192.168.1.103:5173`.
Pour que le scan du QR Code fonctionne depuis un téléphone du même Wi-Fi, remplacez
dans `backend/.env` :

```env
FRONTEND_URL="http://192.168.1.103:5173"
API_URL="http://192.168.1.103:4000"
```

et dans `frontend/.env` :

```env
VITE_API_URL=http://192.168.1.103:4000
```

Redémarrez les deux serveurs, puis **régénérez les QR Codes** depuis
_Administration → Tables_ (l'URL encodée dans le QR Code change).

---

## 12. Comptes de test

| Rôle | Email | Mot de passe |
|---|---|---|
| Administrateur | `admin@chemoiresto.ci` | `Admin@2026` |
| Serveuse | `marie@chemoiresto.ci` | `Serveuse@2026` |

> Ces identifiants sont destinés au développement. **Changez-les avant toute mise en production**
> (variables `SEED_ADMIN_*` / `SEED_SERVER_*` dans `.env`, ou via _Administration → Serveuses_).

Le lien client de la table 01 est affiché à la fin du seed. Vous le retrouvez aussi
dans _Administration → Tables → Lien_.

---

## 13. API

Toutes les routes sont préfixées par `/api`.

### Format de réponse

Succès :
```json
{ "success": true, "message": "Opération réussie", "data": {} }
```

Erreur :
```json
{ "success": false, "message": "Une erreur est survenue" }
```

### Authentification
| Méthode | Route | Accès |
|---|---|---|
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Connecté |
| POST | `/api/auth/logout` | Connecté |

### Client (public, sans compte)
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/menu/table/:token` | Menu du jour de la table |
| GET | `/api/menu/table/:token/orders` | Commandes du jour de la table |
| GET | `/api/menu/table/:token/service-requests` | Demandes en cours |
| POST | `/api/orders` | Passer une commande |
| GET | `/api/orders/track/:token` | Suivre une commande |
| POST | `/api/service-requests` | Appeler une serveuse / demander l'addition |

### Produits & catégories
| Méthode | Route | Accès |
|---|---|---|
| GET | `/api/products` | Personnel |
| GET | `/api/products/:id` | Personnel |
| POST | `/api/products` | Admin (multipart, champ `image`) |
| PUT | `/api/products/:id` | Admin |
| PATCH | `/api/products/:id/availability` | Personnel |
| DELETE | `/api/products/:id` | Admin |
| GET | `/api/categories` | Personnel |
| POST · PUT · DELETE | `/api/categories[/:id]` | Admin |
| PUT | `/api/categories/reorder` | Admin |

### Tables & QR Codes
| Méthode | Route | Accès |
|---|---|---|
| GET | `/api/tables` | Personnel |
| POST · PUT · DELETE | `/api/tables[/:id]` | Admin |
| PATCH | `/api/tables/:id/status` | Admin |
| GET | `/api/tables/:id/qrcode` | Admin |
| POST | `/api/tables/:id/qrcode` | Admin |
| POST | `/api/tables/:id/qrcode/regenerate` | Admin |
| GET | `/api/tables/qrcodes/all` | Admin |

### Menus quotidiens
| Méthode | Route | Accès |
|---|---|---|
| GET | `/api/menus?month=AAAA-MM` | Personnel |
| GET | `/api/menus/today` | Personnel |
| GET | `/api/menus/date/:date` | Personnel |
| GET | `/api/menus/:id` | Personnel |
| POST | `/api/menus` | Admin |
| PUT | `/api/menus/:id` | Admin |
| DELETE | `/api/menus/:id` | Admin |
| POST | `/api/menus/:id/duplicate` | Admin |
| POST | `/api/menus/today/products` | Admin — met un plat au menu du jour (crée le menu s'il n'existe pas) |
| DELETE | `/api/menus/today/products/:productId` | Admin — retire un plat du menu du jour |

### Commandes
| Méthode | Route | Accès |
|---|---|---|
| GET | `/api/orders` | Personnel (filtres et pagination) |
| GET | `/api/orders/board` | Personnel (Kanban du jour) |
| GET | `/api/orders/:id` | Personnel |
| PUT | `/api/orders/:id/status` | Personnel |
| PUT | `/api/orders/:id/assign` | Admin |

### Autres
| Méthode | Route | Accès |
|---|---|---|
| GET · POST · PUT · DELETE | `/api/users/servers[/:id]` | Admin (lecture : personnel) |
| PUT | `/api/users/servers/:id/password` | Admin |
| GET | `/api/users/servers/:id/activity` | Admin |
| GET | `/api/dashboard/stats` | Admin |
| GET | `/api/service-requests` | Personnel |
| PUT | `/api/service-requests/:id/status` | Personnel |
| GET | `/api/notifications` | Personnel |
| PUT | `/api/notifications/:id/read` · `/read-all` | Personnel |
| GET · PUT | `/api/restaurant` | Lecture personnel, écriture Admin |

---

## 14. Socket.IO

Le personnel se connecte avec son JWT (`auth.token`) et rejoint automatiquement le
salon de son restaurant. Le client se connecte sans jeton et rejoint le salon de sa
table puis celui de ses commandes.

### Événements émis par le serveur
| Événement | Destinataire | Déclencheur |
|---|---|---|
| `new_order` | Personnel | Nouvelle commande client |
| `order_updated` | Personnel | Changement de statut ou d'attribution |
| `order_accepted` · `order_preparing` · `order_ready` · `order_served` · `order_cancelled` | Personnel + client | Changement de statut |
| `order_status` | Client | Changement de statut de sa commande |
| `order_assigned` | Serveuse concernée | Attribution par l'administrateur |
| `service_request` | Personnel | Appel serveuse / demande d'addition |
| `service_request_updated` | Personnel + table | Traitement de la demande |
| `notification` | Personnel | Nouvelle notification |
| `menu_updated` | Personnel + clients | Menu créé, modifié ou supprimé |

### Événements envoyés par le client
| Événement | Charge utile |
|---|---|
| `join_table` | jeton de la table |
| `track_order` | jeton de suivi de la commande |
| `untrack_order` | jeton de suivi |

### Chaîne complète

```
Client → POST /api/orders → MySQL → Socket.IO (new_order) → Serveuse
Serveuse → PUT /api/orders/:id/status → MySQL → Socket.IO (order_status) → Client
```

---

## 15. QR Codes

Chaque table possède un **jeton aléatoire de 32 caractères hexadécimaux** (jamais un
identifiant séquentiel). Le QR Code encode :

```
http://VOTRE_FRONTEND/menu/table/8f4a7c...
```

Au scan, le backend vérifie le jeton, retrouve la table, contrôle qu'elle est active,
identifie le restaurant et renvoie le menu du jour.

**Impression** — _Administration → QR Codes_ propose :
- l'aperçu d'une fiche de table,
- le téléchargement PNG,
- l'impression unitaire,
- **« Imprimer tous les QR Codes »** (mise en page A4, 2 fiches par ligne, découpe en pointillés).

Format de la fiche imprimée :

```
        RESTAURANT
        TABLE 01
      [  QR CODE  ]
Scannez pour consulter le menu
```

**Régénérer un QR Code** crée un nouveau jeton : l'ancien QR Code imprimé cesse
immédiatement de fonctionner. À utiliser si un QR Code a été copié ou détourné.

---

## 16. Menu quotidien

Le menu **n'est pas statique**. Un menu est attaché à une **date précise** et à un
restaurant (contrainte d'unicité `restaurantId + date`).

- Le client reçoit automatiquement le menu correspondant à la **date du jour**.
- Si aucun menu n'est programmé, il voit : _« Le menu du jour n'est pas encore disponible »_.
- L'administrateur peut préparer les menus **plusieurs jours à l'avance** ; le système
  active le bon menu automatiquement à la date voulue.
- Chaque ligne de menu peut définir un **prix du jour** différent du prix de base.
  Laisser le champ vide reprend le prix de base.
- La fonction **Copier** duplique un menu vers une autre date sans modifier la source.

### Règles de commande appliquées par le serveur

À chaque commande, le backend vérifie dans l'ordre :

1. la table existe et est active,
2. le restaurant est actif,
3. un menu est publié pour aujourd'hui,
4. chaque produit demandé **appartient au menu du jour**,
5. chaque produit est actif et disponible,
6. les options choisies existent et sont disponibles,
7. les contraintes des groupes d'options sont respectées (obligatoire, choix unique),
8. **les prix sont relus en base** et le total est entièrement recalculé.

Le montant envoyé par le frontend n'est **jamais** utilisé.

---

## 17. Déploiement

### Construire le frontend

```bash
cd frontend
npm run build
```

Le dossier `frontend/dist/` contient les fichiers statiques à servir (Nginx, Apache,
Vercel, Netlify…). Configurez une réécriture vers `index.html` pour que les routes
React fonctionnent au rafraîchissement.

### Backend en production

```bash
cd backend
npm ci --omit=dev
npx prisma migrate deploy
NODE_ENV=production node src/server.js
```

Utilisez un gestionnaire de processus (PM2, systemd, Docker) :

```bash
pm2 start src/server.js --name qr-menu-api
```

### Points de vigilance
- `NODE_ENV=production` (masque les détails d'erreur, durcit le rate limiting)
- `JWT_SECRET` long et unique, **jamais** celui du développement
- `FRONTEND_URL` = domaine réel du frontend (CORS + URL des QR Codes)
- **HTTPS obligatoire** : les téléphones scannent le QR Code sur un réseau public
- Régénérez les QR Codes après un changement de domaine
- Le dossier `backend/uploads/` doit être persistant et sauvegardé
- Changez les mots de passe des comptes de développement

---

## 18. Sécurité

Mesures implémentées :

- **Mots de passe** hachés avec bcrypt (jamais stockés en clair)
- **JWT** signé, expiration configurable, utilisateur rechargé à chaque requête
  (un compte désactivé est bloqué immédiatement)
- **Middleware de rôle** : une serveuse ne peut jamais atteindre une route ou une page d'administration
- **Validation Zod** sur tous les corps, paramètres et requêtes
- **Rate limiting** : global, connexion (anti-force brute), création de commande, demandes de service
- **Anti-spam** sur les appels serveuse et demandes d'addition (une demande ouverte par type et par table)
- **Prix recalculés côté serveur** — impossible de falsifier un montant
- **Jetons de table et de suivi aléatoires**, jamais d'identifiants séquentiels exposés
- **Upload contrôlé** : type MIME **et** extension vérifiés, taille limitée, nom de fichier régénéré
- **Helmet**, **CORS** restreint au frontend déclaré
- **Gestion centralisée des erreurs** : aucune fuite de détail technique en production
- **Secrets hors du dépôt** : `.env` ignoré, `.env.example` fourni
- Suppression protégée : un produit, une table ou un compte lié à des commandes est
  **archivé** au lieu d'être supprimé, pour préserver l'historique

---

## 19. Maintenance

### Tests

```bash
cd backend
npm test
```

72 tests couvrent : connexion, permissions, création de produit et de table, génération
et régénération de QR Code, récupération du menu par date, copie de menu, création de
commande, calcul du total, changement de statut, attribution, notifications, appel
serveuse et demande d'addition, historique des prix.

Test du workflow complet contre un serveur déjà démarré :

```bash
npm run dev          # dans un terminal
npm run test:e2e     # dans un autre
```

### Tâches courantes

| Besoin | Commande |
|---|---|
| Inspecter la base | `npx prisma studio` |
| Appliquer une modification du schéma | `npx prisma migrate dev --name description` |
| Régénérer le client Prisma | `npx prisma generate` |
| Réinitialiser complètement la base | `npx prisma migrate reset` ⚠️ **efface tout** |
| Recréer les données de démo | `npm run seed` |

### Sauvegarde

```bash
mysqldump -u root -p qr_menu > sauvegarde-$(date +%F).sql
```

Sauvegardez également `backend/uploads/` (images des produits et logo).

### Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `Connexion a la base de donnees impossible` | MySQL arrêté | Démarrez MySQL (XAMPP/Laragon), vérifiez `DATABASE_URL` |
| `Impossible de joindre le serveur` dans l'interface | Backend arrêté ou `VITE_API_URL` incorrect | Démarrez le backend, vérifiez `frontend/.env` |
| Le QR Code scanné ouvre une page vide sur téléphone | `FRONTEND_URL` pointe sur `localhost` | Mettez l'IP réseau, redémarrez, régénérez les QR Codes |
| « Le menu du jour n'est pas encore disponible » | Aucun menu pour la date du jour | _Administration → Menus_ → cliquez sur aujourd'hui |
| Pas de son à la réception d'une commande | Le navigateur bloque l'audio avant interaction | Cliquez une fois dans la page |
| Erreur `P2002` | Valeur unique déjà utilisée (email, numéro de table) | Choisissez une autre valeur |
| L'impression ne s'ouvre pas | Fenêtres surgissantes bloquées | Autorisez les pop-ups pour le site |

---

## Résumé des commandes

```bash
# Backend
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run seed
npm run dev

# Frontend
cd frontend
npm install
npm run dev

# Tests
cd backend && npm test
```
