/* eslint-disable no-console */
const path = require('path');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const { randomToken, slugify, today } = require('../src/utils/helpers');
const { upsertQRCode } = require('../src/services/qrcode.service');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@chemoiresto.ci';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@2026';
const SERVER_EMAIL = process.env.SEED_SERVER_EMAIL || 'marie@chemoiresto.ci';
const SERVER_PASSWORD = process.env.SEED_SERVER_PASSWORD || 'Serveuse@2026';

async function main() {
  console.log('Seed de developpement en cours...\n');

  // ----------------------------- Restaurant ------------------------------
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'chemoiresto' },
    update: {},
    create: {
      name: 'CHEMOIRESTO',
      slug: 'chemoiresto',
      description: 'Maquis & Grill - cuisine ivoirienne et grillades au feu de bois.',
      address: 'Cocody Angre, Abidjan',
      phone: '+225 07 00 00 00 00',
      email: 'contact@chemoiresto.ci',
      currency: 'FCFA',
      openingHours: 'Lundi - Dimanche : 11h00 - 23h30',
      primaryColor: '#E4572E',
      welcomeMessage: 'Bienvenue chez nous. Bon appétit !',
    },
  });
  console.log(`Restaurant : ${restaurant.name} (id ${restaurant.id})`);

  // ----------------------------- Utilisateurs ----------------------------
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      restaurantId: restaurant.id,
      firstName: 'Koffi',
      lastName: 'Admin',
      email: ADMIN_EMAIL,
      phone: '+225 07 11 11 11 11',
      password: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  const serveuse = await prisma.user.upsert({
    where: { email: SERVER_EMAIL },
    update: {},
    create: {
      restaurantId: restaurant.id,
      firstName: 'Marie',
      lastName: 'Kouassi',
      email: SERVER_EMAIL,
      phone: '+225 07 22 22 22 22',
      password: await bcrypt.hash(SERVER_PASSWORD, 10),
      role: 'SERVER',
      status: 'ACTIVE',
    },
  });
  console.log(`Comptes    : ${admin.email} (ADMIN), ${serveuse.email} (SERVEUSE)`);

  // ------------------------------ Catégories -----------------------------
  const categoryDefs = [
    { name: 'Entrées', icon: 'Salad', sortOrder: 1 },
    { name: 'Plats', icon: 'UtensilsCrossed', sortOrder: 2 },
    { name: 'Grillades', icon: 'Flame', sortOrder: 3 },
    { name: 'Accompagnements', icon: 'Wheat', sortOrder: 4 },
    { name: 'Boissons', icon: 'CupSoda', sortOrder: 5 },
    { name: 'Desserts', icon: 'IceCream', sortOrder: 6 },
  ];

  const categories = {};
  for (const def of categoryDefs) {
    const slug = slugify(def.name);
    const category = await prisma.category.upsert({
      where: { restaurantId_slug: { restaurantId: restaurant.id, slug } },
      update: { name: def.name, icon: def.icon, sortOrder: def.sortOrder },
      create: { restaurantId: restaurant.id, name: def.name, slug, icon: def.icon, sortOrder: def.sortOrder },
    });
    categories[slug] = category;
  }
  console.log(`Catégories : ${Object.keys(categories).length} créées`);

  // ------------------------------- Produits ------------------------------
  const productDefs = [
    {
      name: 'Poulet braise',
      description: 'Poulet marine et braise au feu de bois, accompagne au choix.',
      basePrice: 5000,
      category: 'grillades',
      options: [
        {
          name: 'Accompagnement',
          type: 'SINGLE',
          isRequired: true,
          values: [
            { name: 'Alloco', priceDelta: 0 },
            { name: 'Attieke', priceDelta: 0 },
            { name: 'Frites', priceDelta: 500 },
            { name: 'Riz', priceDelta: 0 },
          ],
        },
        {
          name: 'Suppléments',
          type: 'MULTIPLE',
          isRequired: false,
          values: [
            { name: 'Fromage', priceDelta: 500 },
            { name: 'Sauce piment', priceDelta: 300 },
            { name: 'Oeuf', priceDelta: 500 },
          ],
        },
      ],
    },
    {
      name: 'Poisson braise',
      description: 'Machoiron entier braise, sauce tomate fraiche et oignons.',
      basePrice: 6000,
      category: 'grillades',
      options: [
        {
          name: 'Accompagnement',
          type: 'SINGLE',
          isRequired: true,
          values: [
            { name: 'Attieke', priceDelta: 0 },
            { name: 'Alloco', priceDelta: 0 },
            { name: 'Frites', priceDelta: 500 },
          ],
        },
      ],
    },
    {
      name: 'Brochettes de boeuf',
      description: 'Trois brochettes de boeuf grillees, sauce arachide.',
      basePrice: 3500,
      category: 'grillades',
    },
    {
      name: 'Attieke poisson',
      description: 'Attieke servi avec poisson frit et legumes frais.',
      basePrice: 4000,
      category: 'plats',
    },
    {
      name: 'Sauce graine',
      description: 'Sauce graine traditionnelle, viande ou poisson au choix.',
      basePrice: 4500,
      category: 'plats',
      options: [
        {
          name: 'Proteine',
          type: 'SINGLE',
          isRequired: true,
          values: [
            { name: 'Viande', priceDelta: 0 },
            { name: 'Poisson', priceDelta: 500 },
          ],
        },
      ],
    },
    { name: 'Salade avocat', description: 'Salade fraiche, avocat, tomate, vinaigrette maison.', basePrice: 2500, category: 'entrees' },
    { name: 'Alloco', description: 'Bananes plantains frites, sauce piment.', basePrice: 1000, category: 'accompagnements' },
    { name: 'Frites maison', description: 'Pommes de terre fraiches coupees et frites.', basePrice: 1500, category: 'accompagnements' },
    { name: 'Coca-Cola 50cl', description: 'Bouteille fraiche.', basePrice: 500, category: 'boissons' },
    { name: 'Eau minerale 1,5L', description: 'Bouteille d\'eau fraiche.', basePrice: 500, category: 'boissons' },
    { name: 'Jus de gingembre', description: 'Jus naturel maison, servi bien frais.', basePrice: 1000, category: 'boissons' },
    { name: 'Ananas frais', description: 'Ananas de Bonoua decoupe.', basePrice: 1000, category: 'desserts' },
  ];

  const products = {};
  for (const [index, def] of productDefs.entries()) {
    const existing = await prisma.product.findFirst({
      where: { restaurantId: restaurant.id, name: def.name },
    });

    let product;
    if (existing) {
      product = existing;
    } else {
      product = await prisma.product.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: categories[def.category].id,
          name: def.name,
          description: def.description,
          basePrice: def.basePrice,
          sortOrder: index,
          options: def.options
            ? {
                create: def.options.map((option, optionIndex) => ({
                  name: option.name,
                  type: option.type,
                  isRequired: option.isRequired,
                  sortOrder: optionIndex,
                  values: {
                    create: option.values.map((value, valueIndex) => ({
                      name: value.name,
                      priceDelta: value.priceDelta,
                      sortOrder: valueIndex,
                    })),
                  },
                })),
              }
            : undefined,
        },
      });
    }
    products[def.name] = product;
  }
  console.log(`Produits   : ${Object.keys(products).length} disponibles`);

  // -------------------------------- Tables -------------------------------
  const tableNumbers = ['01', '02', '03', '04', '05', '06'];
  for (const number of tableNumbers) {
    let table = await prisma.restaurantTable.findFirst({
      where: { restaurantId: restaurant.id, number },
    });
    if (!table) {
      table = await prisma.restaurantTable.create({
        data: {
          restaurantId: restaurant.id,
          number,
          label: `Table ${number}`,
          capacity: 4,
          token: randomToken(16),
        },
      });
    }
    await upsertQRCode(table.id, table.token);
  }
  console.log(`Tables     : ${tableNumbers.length} avec QR Codes generes`);

  // --------------------------- Menu du jour ------------------------------
  const menuDate = today();
  const menuProducts = [
    { name: 'Poulet braise', isDishOfDay: true },
    { name: 'Poisson braise' },
    { name: 'Brochettes de boeuf' },
    { name: 'Attieke poisson' },
    { name: 'Salade avocat' },
    { name: 'Alloco' },
    { name: 'Frites maison' },
    { name: 'Coca-Cola 50cl' },
    { name: 'Eau minerale 1,5L' },
    { name: 'Jus de gingembre' },
    { name: 'Ananas frais' },
  ];

  const existingMenu = await prisma.dailyMenu.findUnique({
    where: { restaurantId_date: { restaurantId: restaurant.id, date: menuDate } },
  });

  if (!existingMenu) {
    await prisma.dailyMenu.create({
      data: {
        restaurantId: restaurant.id,
        date: menuDate,
        title: 'Menu du jour',
        isPublished: true,
        items: {
          create: menuProducts.map((entry, index) => ({
            productId: products[entry.name].id,
            isDishOfDay: entry.isDishOfDay || false,
            sortOrder: index,
          })),
        },
      },
    });
    console.log(`Menu       : menu du jour créé (${menuProducts.length} produits)`);
  } else {
    console.log('Menu       : un menu existe déjà pour aujourd\'hui, inchangé');
  }

  // ------------------------------ Recapitulatif --------------------------
  const firstTable = await prisma.restaurantTable.findFirst({
    where: { restaurantId: restaurant.id },
    orderBy: { number: 'asc' },
  });

  console.log('\n--------------------------------------------------');
  console.log('IDENTIFIANTS DE DEVELOPPEMENT');
  console.log('--------------------------------------------------');
  console.log(`ADMIN    : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`SERVEUSE : ${SERVER_EMAIL} / ${SERVER_PASSWORD}`);
  console.log('--------------------------------------------------');
  console.log('Lien client (table 01) :');
  console.log(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/menu/table/${firstTable.token}`);
  console.log('--------------------------------------------------\n');
}

main()
  .catch((error) => {
    console.error('Echec du seed :', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
