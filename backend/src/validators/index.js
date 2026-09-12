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
    .min(min, `${label} : ${min} caractere(s) minimum`)
    .max(max, `${label} : ${max} caracteres maximum`);

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
// Categories
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
  basePrice: z.coerce.number().min(0, 'Le prix doit etre positif').max(100000000),
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
  number: trimmed(1, 20, 'Numero de table'),
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

const createOrderSchema = z.object({
  tableToken: z.string().regex(/^[a-f0-9]{16,64}$/i, 'Table invalide'),
  customerName: optionalText(80),
  comment: optionalText(500),
  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().min(1, 'Quantite minimale : 1').max(50),
        note: optionalText(200),
        optionValueIds: z.array(z.coerce.number().int().positive()).max(20).optional().default([]),
      })
    )
    .min(1, 'Votre panier est vide')
    .max(60),
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
  firstName: trimmed(2, 60, 'Prenom'),
  lastName: trimmed(2, 60, 'Nom'),
  email: z.string().trim().toLowerCase().email('Adresse email invalide'),
  phone: optionalText(30),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caracteres')
    .max(72, 'Mot de passe trop long'),
  role: z.enum(['ADMIN', 'SERVER']).optional().default('SERVER'),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

const updateServerSchema = createServerSchema.partial().omit({ password: true });

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caracteres').max(72),
});

// ---------------------------------------------------------------------------
// Demandes de service
// ---------------------------------------------------------------------------

const createServiceRequestSchema = z.object({
  tableToken: z.string().regex(/^[a-f0-9]{16,64}$/i, 'Table invalide'),
  type: z.enum(['CALL_SERVER', 'BILL']),
  message: optionalText(200),
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
  updateServiceRequestSchema,
  updateRestaurantSchema,
};
