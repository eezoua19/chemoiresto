const { z } = require('zod');

// ---------------------------------------------------------------------------
// Fragments reutilisables
// ---------------------------------------------------------------------------

const idParam = z.object({
  id: z.coerce.number().int().positive({ message: 'Identifiant invalide' }),
});

const tokenParam = z.object({
  token: z.string().regex(/^[a-f0-9]{16,64}$/i, 'Jeton invalide'),
});

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date attendu : AAAA-MM-JJ');

const trimmed = (min, max, label) =>
  z
    .string()
    .trim()
    .min(min, `${label} : ${min} caractère(s) minimum`)
    .max(max, `${label} : ${max} caractères maximum`);

const optionalText = (max) =>
  z.string().trim().max(max).optional().nullable().or(z.literal('')).transform((v) => (v === '' ? null : v));

/** "true"/"false" envoyes en multipart -> booleen. */
const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

// ---------------------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

// ---------------------------------------------------------------------------
// Catégories
// ---------------------------------------------------------------------------

const createCategorySchema = z.object({
  name: trimmed(2, 60, 'Nom'),
  icon: optionalText(40),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: booleanish.optional(),
});

const updateCategorySchema = createCategorySchema.partial();

const reorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        sortOrder: z.coerce.number().int().min(0),
      })
    )
    .min(1),
});

// ---------------------------------------------------------------------------
// Produits
// ---------------------------------------------------------------------------

const optionValueSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: trimmed(1, 60, 'Nom de l\'option'),
  priceDelta: z.coerce.number().min(0).max(1000000).default(0),
  isAvailable: booleanish.optional().default(true),
  sortOrder: z.coerce.number().int().min(0).optional().default(0),
});

const productOptionSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: trimmed(1, 60, 'Nom du groupe'),
  type: z.enum(['SINGLE', 'MULTIPLE']).default('SINGLE'),
  isRequired: booleanish.optional().default(false),
  sortOrder: z.coerce.number().int().min(0).optional().default(0),
  values: z.array(optionValueSchema).max(30).default([]),
});

/** Les champs arrivent en multipart (chaines) : on force les types. */
const createProductSchema = z.object({
  name: trimmed(2, 120, 'Nom'),
  description: optionalText(2000),
  basePrice: z.coerce.number().min(0, 'Le prix doit être positif').max(100000000),
  categoryId: z.coerce.number().int().positive().optional().nullable(),
  isAvailable: booleanish.optional(),
  isActive: booleanish.optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  options: z
    .union([z.string(), z.array(productOptionSchema)])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined;
      if (Array.isArray(value)) return value;
      try {
        const parsed = JSON.parse(value);
        const result = z.array(productOptionSchema).safeParse(parsed);
        if (!result.success) throw new Error('invalid');
        return result.data;
      } catch (error) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Options invalides' });
        return z.NEVER;
      }
    }),
});

const updateProductSchema = createProductSchema.partial().extend({
  removeImage: booleanish.optional(),
});

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const createTableSchema = z.object({
  number: trimmed(1, 20, 'Numéro de table'),
  label: optionalText(60),
  capacity: z.coerce.number().int().min(1).max(50).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

const updateTableSchema = createTableSchema.partial();

// ---------------------------------------------------------------------------
// Menus quotidiens
// ---------------------------------------------------------------------------

const menuItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  price: z.coerce.number().min(0).max(100000000).optional().nullable(),
  description: optionalText(1000),
  isAvailable: booleanish.optional().default(true),
  isDishOfDay: booleanish.optional().default(false),
  sortOrder: z.coerce.number().int().min(0).optional().default(0),
});

const createMenuSchema = z.object({
  date: dateString,
  title: optionalText(120),
  note: optionalText(1000),
  isPublished: booleanish.optional().default(true),
  items: z.array(menuItemSchema).max(300).default([]),
});

const updateMenuSchema = z.object({
  title: optionalText(120),
  note: optionalText(1000),
  isPublished: booleanish.optional(),
  items: z.array(menuItemSchema).max(300).optional(),
});

const duplicateMenuSchema = z.object({
  targetDate: dateString,
  overwrite: booleanish.optional().default(false),
});

/** Mise au menu du jour en un clic depuis la page Produits. */
const todayProductSchema = z.object({
  productId: z.coerce.number().int().positive(),
});

const productIdParam = z.object({
  productId: z.coerce.number().int().positive({ message: 'Identifiant produit invalide' }),
});

const menuRangeQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM').optional(),
});

const dashboardQuerySchema = z.object({
  // Mois consulte. Absent = mois en cours.
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format attendu : AAAA-MM').optional(),
});

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

const jetonClient = z.string().regex(/^[a-f0-9]{16,64}$/i, 'Jeton invalide');

const createOrderSchema = z
  .object({
    tableToken: jetonClient.optional(),
    takeawayToken: jetonClient.optional(),
    customerName: optionalText(80),
    customerPhone: optionalText(30),
    comment: optionalText(500),
    promoCode: optionalText(40),
    // Uniquement pertinent a emporter : le client dit qu'il compte manger sur
    // place a son arrivee, plutot que reellement emporter le plat.
    eatInLater: booleanish.optional(),
    items: z
      .array(
        z.object({
          productId: z.coerce.number().int().positive(),
          quantity: z.coerce.number().int().min(1, 'Quantité minimale : 1').max(50),
          note: optionalText(200),
          optionValueIds: z.array(z.coerce.number().int().positive()).max(20).optional().default([]),
        })
      )
      .min(1, 'Votre panier est vide')
      .max(60),
  })
  // Une commande vient d'une table OU du comptoir, jamais des deux : accepter
  // les deux jetons laisserait le doute sur ce qu'il faut facturer a qui.
  .refine((body) => Boolean(body.tableToken) !== Boolean(body.takeawayToken), {
    message: 'Indiquez soit une table, soit une commande à emporter',
    path: ['tableToken'],
  });

const updateOrderStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']),
  comment: optionalText(200),
});

const assignOrderSchema = z.object({
  serverId: z.coerce.number().int().positive().nullable(),
});

const ordersQuerySchema = z.object({
  status: z
    .union([
      z.enum(['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']),
      z.array(z.enum(['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'])),
    ])
    .optional(),
  period: z.enum(['today', 'yesterday', 'week', 'month', 'all', 'custom']).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  tableId: z.coerce.number().int().positive().optional(),
  type: z.enum(['DINE_IN', 'TAKEAWAY']).optional(),
  serverId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(80).optional(),
  mine: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

// ---------------------------------------------------------------------------
// Serveuses
// ---------------------------------------------------------------------------

const createServerSchema = z.object({
  firstName: trimmed(2, 60, 'Prénom'),
  lastName: trimmed(2, 60, 'Nom'),
  email: z.string().trim().toLowerCase().email('Adresse email invalide'),
  phone: optionalText(30),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .max(72, 'Mot de passe trop long'),
  role: z.enum(['ADMIN', 'SERVER']).optional().default('SERVER'),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

const updateServerSchema = createServerSchema.partial().omit({ password: true });

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').max(72),
});

// ---------------------------------------------------------------------------
// Demandes de service
// ---------------------------------------------------------------------------

const createServiceRequestSchema = z.object({
  tableToken: z.string().regex(/^[a-f0-9]{16,64}$/i, 'Table invalide'),
  type: z.enum(['CALL_SERVER', 'BILL']),
  message: optionalText(200),
});

// Le rappel porte sur la demande deja ouverte : pas de message a joindre.
const remindServiceRequestSchema = z.object({
  tableToken: z.string().regex(/^[a-f0-9]{16,64}$/i, 'Table invalide'),
  type: z.enum(['CALL_SERVER', 'BILL']),
});

const updateServiceRequestSchema = z.object({
  status: z.enum(['PENDING', 'TAKEN', 'COMPLETED', 'REQUESTED', 'PROCESSING', 'PAID', 'CANCELLED']),
});

// ---------------------------------------------------------------------------
// Restaurant
// ---------------------------------------------------------------------------

const updateRestaurantSchema = z.object({
  name: trimmed(2, 120, 'Nom').optional(),
  description: optionalText(2000),
  address: optionalText(200),
  phone: optionalText(30),
  email: z.string().trim().toLowerCase().email('Email invalide').optional().nullable().or(z.literal('')),
  currency: trimmed(1, 10, 'Devise').optional(),
  openingHours: optionalText(500),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur attendue au format #RRGGBB')
    .optional(),
  welcomeMessage: optionalText(300),
  loyaltyEnabled: booleanish.optional(),
  loyaltyRewardThreshold: z.coerce.number().int().min(1).max(1000).optional(),
  loyaltyRewardLabel: optionalText(120),
});

// z.boolean() et non z.coerce.boolean() : la coercition transformerait la
// chaine "false" en true, et fermer la vente à emporter deviendrait impossible.
const takeawaySchema = z.object({
  enabled: z.boolean(),
  // Ne sert qu'au cas ou l'affiche du comptoir a été photographiee ou diffusee
  // par erreur : on change le jeton, l'ancienne adresse cesse de fonctionner.
  regenerate: z.boolean().optional().default(false),
});

// ---------------------------------------------------------------------------
// Abonnements
// ---------------------------------------------------------------------------

const PLANS = ['HEBDOMADAIRE', 'MENSUEL', 'TRIMESTRIEL', 'ANNUEL'];

// Un numero ivoirien s'ecrit de dix facons differentes (+225, espaces, tirets).
// On accepte large et on garde ce que la personne a saisi : c'est un numero
// qu'on appelle, pas une cle.
const telephone = z
  .string()
  .trim()
  .min(6, 'Numero de telephone trop court')
  .max(30, 'Numero de telephone trop long')
  .regex(/^[0-9+().\s-]+$/, 'Numero de telephone invalide');

const createSubscriptionSchema = z.object({
  firstName: trimmed(2, 60, 'Prenom'),
  lastName: trimmed(2, 60, 'Nom'),
  phone: telephone,
  plan: z.enum(PLANS),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
  amount: z.coerce.number().nonnegative().max(99999999).optional().nullable(),
  note: optionalText(500),
});

const updateSubscriptionSchema = z.object({
  firstName: trimmed(2, 60, 'Prenom').optional(),
  lastName: trimmed(2, 60, 'Nom').optional(),
  phone: telephone.optional(),
  plan: z.enum(PLANS).optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
  amount: z.coerce.number().nonnegative().max(99999999).optional().nullable(),
  note: optionalText(500),
});

const subscriptionStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE']),
});

const renewSubscriptionSchema = z.object({
  plan: z.enum(PLANS).optional(),
  endDate: dateString.optional(),
  amount: z.coerce.number().nonnegative().max(99999999).optional().nullable(),
});

const subscriptionUseSchema = z.object({
  type: z.enum(['REPAS', 'BOISSON', 'AUTRE']).optional().default('REPAS'),
  orderId: z.coerce.number().int().positive().optional().nullable(),
  note: optionalText(200),
});

const subscriptionLookupSchema = z.object({
  q: z.string().trim().min(2, 'Saisissez au moins 2 caractères').max(60),
});

const subscriptionsQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  state: z.enum(['VALIDE', 'EXPIRE', 'SUSPENDU', 'INACTIF', 'BIENTOT']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

// ---------------------------------------------------------------------------
// Fidélité
// ---------------------------------------------------------------------------

const loyaltyAdjustSchema = z.object({
  delta: z.coerce.number().int().refine((v) => v !== 0, 'Le montant ne peut pas être nul'),
  note: trimmed(3, 300, 'Motif'),
});

const loyaltyQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

// ---------------------------------------------------------------------------
// Avis
// ---------------------------------------------------------------------------

const createReviewSchema = z.object({
  trackingToken: jetonClient,
  rating: z.coerce.number().int().min(1, 'Note minimale : 1').max(5, 'Note maximale : 5'),
  comment: optionalText(1000),
});

const reviewsQuerySchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

// ---------------------------------------------------------------------------
// Notifications push
// ---------------------------------------------------------------------------

const pushSubscribeSchema = z.object({
  endpoint: z.string().trim().url('Endpoint invalide').max(500),
  keys: z.object({
    p256dh: trimmed(1, 255, 'Clé p256dh'),
    auth: trimmed(1, 255, 'Clé auth'),
  }),
});

const pushUnsubscribeSchema = z.object({
  endpoint: z.string().trim().url('Endpoint invalide').max(500),
});

// Cote client (pas de compte) : l'abonnement est rattache a la commande
// suivie via son jeton, pas a un utilisateur.
const pushSubscribeClientSchema = z.object({
  trackingToken: jetonClient,
  endpoint: z.string().trim().url('Endpoint invalide').max(500),
  keys: z.object({
    p256dh: trimmed(1, 255, 'Clé p256dh'),
    auth: trimmed(1, 255, 'Clé auth'),
  }),
});

const pushUnsubscribeClientSchema = z.object({
  endpoint: z.string().trim().url('Endpoint invalide').max(500),
});

// ---------------------------------------------------------------------------
// Codes promo
// ---------------------------------------------------------------------------

const promoCodeBase = z.object({
  code: trimmed(2, 40, 'Code').transform((v) => v.toUpperCase()),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.coerce.number().positive('La valeur doit être positive'),
  minOrderAmount: z.coerce.number().min(0).optional().nullable(),
  maxUses: z.coerce.number().int().positive().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
});

const createPromoCodeSchema = promoCodeBase.refine(
  (body) => body.type !== 'PERCENT' || body.value <= 100,
  { message: 'Un pourcentage ne peut pas dépasser 100', path: ['value'] }
);

const updatePromoCodeSchema = z
  .object({
    code: trimmed(2, 40, 'Code').transform((v) => v.toUpperCase()).optional(),
    type: z.enum(['PERCENT', 'FIXED']).optional(),
    value: z.coerce.number().positive('La valeur doit être positive').optional(),
    minOrderAmount: z.coerce.number().min(0).optional().nullable(),
    maxUses: z.coerce.number().int().positive().optional().nullable(),
    expiresAt: z.coerce.date().optional().nullable(),
    isActive: booleanish.optional(),
  })
  .refine((body) => !(body.type === 'PERCENT' && body.value && body.value > 100), {
    message: 'Un pourcentage ne peut pas dépasser 100',
    path: ['value'],
  });

const validatePromoCodeSchema = z.object({
  token: jetonClient,
  code: trimmed(2, 40, 'Code'),
  subtotal: z.coerce.number().min(0),
});

// ---------------------------------------------------------------------------
// Journal des actions
// ---------------------------------------------------------------------------

const auditQuerySchema = z.object({
  action: z.string().trim().max(60).optional(),
  entity: z.string().trim().max(40).optional(),
  q: z.string().trim().max(80).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/**
 * Temps d'attente annonce au client.
 * 0 efface l'annonce ; 240 minutes est une borne de securite, pas une cible.
 */
const orderEstimateSchema = z.object({
  minutes: z.coerce
    .number()
    .int()
    .min(0, 'Le temps annoncé ne peut pas être négatif')
    .max(240, 'Temps annoncé trop long'),
});

// ---------------------------------------------------------------------------
// Remise a zero
// ---------------------------------------------------------------------------

const resetSchema = z.object({
  // Le nom du restaurant, tape a la main. La comparaison se fait cote serveur.
  confirmation: trimmed(1, 120, 'Confirmation'),
  resetMenus: booleanish.optional().default(false),
});

// ---------------------------------------------------------------------------
// Clotures de journee
// ---------------------------------------------------------------------------

const dateParam = z.object({ date: dateString });

const exportClosingsSchema = z.object({
  from: dateString,
  to: dateString,
});

const closingsQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  // Les journees sans service sont bien enregistrees, mais masquees par
  // defaut : une page de zeros noie les journees qui comptent.
  includeEmpty: booleanish.optional().default(false),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(31),
});

module.exports = {
  idParam,
  tokenParam,
  dateString,
  loginSchema,
  createCategorySchema,
  updateCategorySchema,
  reorderSchema,
  createProductSchema,
  updateProductSchema,
  createTableSchema,
  updateTableSchema,
  createMenuSchema,
  updateMenuSchema,
  duplicateMenuSchema,
  menuRangeQuerySchema,
  dashboardQuerySchema,
  todayProductSchema,
  productIdParam,
  createOrderSchema,
  updateOrderStatusSchema,
  assignOrderSchema,
  ordersQuerySchema,
  createServerSchema,
  updateServerSchema,
  resetPasswordSchema,
  createServiceRequestSchema,
  remindServiceRequestSchema,
  updateServiceRequestSchema,
  updateRestaurantSchema,
  takeawaySchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
  subscriptionStatusSchema,
  renewSubscriptionSchema,
  subscriptionUseSchema,
  subscriptionsQuerySchema,
  subscriptionLookupSchema,
  auditQuerySchema,
  dateParam,
  closingsQuerySchema,
  exportClosingsSchema,
  resetSchema,
  orderEstimateSchema,
  loyaltyAdjustSchema,
  loyaltyQuerySchema,
  createReviewSchema,
  reviewsQuerySchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  pushSubscribeClientSchema,
  pushUnsubscribeClientSchema,
  createPromoCodeSchema,
  updatePromoCodeSchema,
  validatePromoCodeSchema,
};
