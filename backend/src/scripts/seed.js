/**
 * Database seed script.
 * Run: npm run seed
 *
 * Creates sample admin, delivery partners, products.
 * Safe to run multiple times — skips if data exists.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../modules/auth/user.model');
const Product = require('../modules/catalog/product.model');
const Counter = require('../common/counter.model');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stationery_platform';

const sampleProducts = [
  {
    sku: 'PEN-0001',
    name: 'Premium Blue Gel Pen',
    slug: 'premium-blue-gel-pen',
    description: 'Smooth writing gel pen with 0.7mm tip. Ideal for everyday office use.',
    category: 'Pens',
    subcategory: 'Gel Pens',
    brand: 'Cello',
    tags: ['office', 'gel', 'blue'],
    basePrice: 5000,
    priceTiers: [
      { minQty: 1, maxQty: 49, pricePerUnit: 5000 },
      { minQty: 50, maxQty: 199, pricePerUnit: 4500 },
      { minQty: 200, maxQty: null, pricePerUnit: 4000 },
    ],
    gstRate: 18,
    hsnCode: '96081000',
    stock: 5000,
    minOrderQty: 10,
    unit: 'piece',
    attributes: { color: 'Blue', inkType: 'Gel', tipSize: '0.7mm' },
  },
  {
    sku: 'PEN-0002',
    name: 'Black Ballpoint Pen (Pack of 10)',
    slug: 'black-ballpoint-pen-pack-10',
    description: 'Reliable ballpoint pens for bulk office use. Pack of 10.',
    category: 'Pens',
    subcategory: 'Ballpoint Pens',
    brand: 'Reynolds',
    tags: ['office', 'ballpoint', 'black', 'value'],
    basePrice: 8000,
    priceTiers: [
      { minQty: 1, maxQty: 29, pricePerUnit: 8000 },
      { minQty: 30, maxQty: 99, pricePerUnit: 7000 },
      { minQty: 100, maxQty: null, pricePerUnit: 6500 },
    ],
    gstRate: 18,
    hsnCode: '96081000',
    stock: 3000,
    minOrderQty: 5,
    unit: 'pack',
    attributes: { color: 'Black', inkType: 'Oil-based', quantity: '10 per pack' },
  },
  {
    sku: 'NTB-0001',
    name: 'A4 Spiral Notebook 200 Pages',
    slug: 'a4-spiral-notebook-200-pages',
    description: 'High quality ruled A4 notebook with spiral binding. 200 pages.',
    category: 'Notebooks',
    subcategory: 'Spiral Notebooks',
    brand: 'Classmate',
    tags: ['notebook', 'spiral', 'a4', 'ruled'],
    basePrice: 15000,
    priceTiers: [
      { minQty: 1, maxQty: 24, pricePerUnit: 15000 },
      { minQty: 25, maxQty: 99, pricePerUnit: 13000 },
      { minQty: 100, maxQty: null, pricePerUnit: 11000 },
    ],
    gstRate: 12,
    hsnCode: '48201000',
    stock: 2000,
    minOrderQty: 5,
    unit: 'piece',
    attributes: { size: 'A4', pages: '200', ruling: 'Ruled', binding: 'Spiral' },
  },
  {
    sku: 'PPR-0001',
    name: 'A4 Copier Paper (500 Sheets)',
    slug: 'a4-copier-paper-500-sheets',
    description: '75 GSM white copier paper. 500 sheets per ream. Suitable for all printers.',
    category: 'Paper',
    subcategory: 'Copier Paper',
    brand: 'JK Paper',
    tags: ['paper', 'a4', 'copier', 'printer'],
    basePrice: 35000,
    priceTiers: [
      { minQty: 1, maxQty: 9, pricePerUnit: 35000 },
      { minQty: 10, maxQty: 49, pricePerUnit: 32000 },
      { minQty: 50, maxQty: null, pricePerUnit: 28000 },
    ],
    gstRate: 12,
    hsnCode: '48025690',
    stock: 1000,
    minOrderQty: 1,
    unit: 'ream',
    attributes: { size: 'A4', gsm: '75', sheets: '500', color: 'White' },
  },
  {
    sku: 'DSK-0001',
    name: 'Desk Organizer - 5 Compartment',
    slug: 'desk-organizer-5-compartment',
    description: 'Sturdy plastic desk organizer with 5 compartments for pens, clips, and more.',
    category: 'Desk Accessories',
    subcategory: 'Organizers',
    brand: 'Solo',
    tags: ['desk', 'organizer', 'office'],
    basePrice: 45000,
    priceTiers: [
      { minQty: 1, maxQty: 19, pricePerUnit: 45000 },
      { minQty: 20, maxQty: null, pricePerUnit: 38000 },
    ],
    gstRate: 18,
    hsnCode: '39241090',
    stock: 500,
    minOrderQty: 1,
    unit: 'piece',
    attributes: { material: 'Plastic', compartments: '5', color: 'Black' },
  },
  {
    sku: 'FIL-0001',
    name: 'Lever Arch File A4',
    slug: 'lever-arch-file-a4',
    description: 'Durable lever arch file for A4 documents. Board cover with metal mechanism.',
    category: 'Files',
    subcategory: 'Lever Arch Files',
    brand: 'Camlin',
    tags: ['file', 'lever-arch', 'a4', 'office'],
    basePrice: 22000,
    priceTiers: [
      { minQty: 1, maxQty: 24, pricePerUnit: 22000 },
      { minQty: 25, maxQty: 99, pricePerUnit: 19000 },
      { minQty: 100, maxQty: null, pricePerUnit: 16000 },
    ],
    gstRate: 18,
    hsnCode: '48203000',
    stock: 800,
    minOrderQty: 5,
    unit: 'piece',
    attributes: { size: 'A4', material: 'Board', color: 'Blue' },
  },
  {
    sku: 'MRK-0001',
    name: 'Whiteboard Marker Set (4 Colors)',
    slug: 'whiteboard-marker-set-4-colors',
    description: 'Non-toxic whiteboard markers. Set of 4: black, blue, red, green.',
    category: 'Markers',
    subcategory: 'Whiteboard Markers',
    brand: 'Luxor',
    tags: ['marker', 'whiteboard', 'set', 'office'],
    basePrice: 18000,
    priceTiers: [
      { minQty: 1, maxQty: 19, pricePerUnit: 18000 },
      { minQty: 20, maxQty: 49, pricePerUnit: 16000 },
      { minQty: 50, maxQty: null, pricePerUnit: 14000 },
    ],
    gstRate: 18,
    hsnCode: '96082000',
    stock: 1500,
    minOrderQty: 5,
    unit: 'set',
    attributes: { colors: '4 (Black, Blue, Red, Green)', type: 'Non-toxic' },
  },
  {
    sku: 'STP-0001',
    name: 'Heavy Duty Stapler',
    slug: 'heavy-duty-stapler',
    description: 'Metal stapler for up to 100 sheets. Uses standard 23/13 staples.',
    category: 'Staples',
    subcategory: 'Staplers',
    brand: 'Kangaro',
    tags: ['stapler', 'heavy-duty', 'office'],
    basePrice: 85000,
    priceTiers: [
      { minQty: 1, maxQty: 9, pricePerUnit: 85000 },
      { minQty: 10, maxQty: null, pricePerUnit: 75000 },
    ],
    gstRate: 18,
    hsnCode: '84729010',
    stock: 300,
    minOrderQty: 1,
    unit: 'piece',
    attributes: { capacity: '100 sheets', stapleSize: '23/13', material: 'Metal' },
  },
];

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // ── Create admin user (if not exists) ──
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      await User.create({
        email: 'admin@stationeryhub.com',
        name: 'Admin User',
        role: 'admin',
        isActive: true,
        lastLoginAt: new Date(),
      });
      console.log('✓ Admin user created (admin@stationeryhub.com)');
    } else {
      console.log('⊘ Admin user already exists');
    }

    // ── Create sample delivery partners ──
    const dpExists = await User.findOne({ role: 'delivery' });
    if (!dpExists) {
      const partners = [
        { email: 'raj@delivery.com', name: 'Raj Kumar', phone: '+919876543210', vehicleType: 'van' },
        { email: 'priya@delivery.com', name: 'Priya Singh', phone: '+919876543211', vehicleType: 'bike' },
        { email: 'amit@delivery.com', name: 'Amit Patel', phone: '+919876543212', vehicleType: 'truck' },
      ];

      for (const p of partners) {
        await User.create({
          email: p.email,
          name: p.name,
          phone: p.phone,
          role: 'delivery',
          isActive: true,
          deliveryProfile: {
            vehicleType: p.vehicleType,
            isAvailable: true,
            activeDeliveries: 0,
            maxConcurrentDeliveries: 5,
          },
        });
      }
      console.log('✓ 3 delivery partners created');
    } else {
      console.log('⊘ Delivery partners already exist');
    }

    // ── Seed products ──
    const productCount = await Product.countDocuments();
    if (productCount === 0) {
      await Product.insertMany(sampleProducts);
      console.log(`✓ ${sampleProducts.length} products created`);
    } else {
      console.log(`⊘ Products already exist (${productCount} found)`);
    }

    console.log('\nSeed complete!');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
