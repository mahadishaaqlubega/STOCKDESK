const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const sequelize = require('../config/db');
const Shop = require('./shop');
const User = require('./user');
const Customer = require('./customer');
const DayClosure = require('./dayClosure');
const Product = require('./product');
const Sale = require('./sale');
const SaleItem = require('./saleItem');
const Receipt = require('./receipt');
const Setting = require('./setting');
const Expense = require('./expense');
const StockIn = require('./stockIn');
const SaleReturn = require('./saleReturn');
const SaleReturnItem = require('./saleReturnItem');
const Audit = require('./audit');
const StockReconciliation = require('./stockReconciliation');
const PendingSignup = require('./pendingSignup');
const CreditPayment = require('./creditPayment');
const Supplier = require('./supplier');
const Purchase = require('./purchase');
const PurchaseItem = require('./purchaseItem');
const SupplierPayment = require('./supplierPayment');
const SubscriptionPayment = require('./subscriptionPayment');
const PaymentRequest = require('./paymentRequest');
const PlatformSetting = require('./platformSetting');
const CustomerPrice = require('./customerPrice');
const { backfillMissingUsernames, generateUniqueUsername } = require('../utils/username');
const { generateUniqueShopSlug } = require('../utils/shop');

Shop.hasMany(User, { foreignKey: 'shopId', as: 'users', onDelete: 'CASCADE', hooks: true });
User.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });

Shop.hasMany(Customer, { foreignKey: 'shopId', as: 'customers', onDelete: 'CASCADE', hooks: true });
Customer.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });

Shop.hasMany(DayClosure, { foreignKey: 'shopId', as: 'dayClosures', onDelete: 'CASCADE', hooks: true });
DayClosure.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });

Shop.hasMany(Product, { foreignKey: 'shopId', as: 'products', onDelete: 'CASCADE', hooks: true });
Product.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });

Shop.hasMany(Sale, { foreignKey: 'shopId', as: 'sales', onDelete: 'CASCADE', hooks: true });
Sale.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });

Shop.hasMany(SaleItem, { foreignKey: 'shopId', as: 'saleItems', onDelete: 'CASCADE', hooks: true });
SaleItem.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });

Shop.hasMany(Receipt, { foreignKey: 'shopId', as: 'receipts', onDelete: 'CASCADE', hooks: true });
Receipt.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });

Shop.hasOne(Setting, { foreignKey: 'shopId', as: 'settings', onDelete: 'CASCADE', hooks: true });
Setting.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });

User.hasMany(Sale, { foreignKey: 'cashierId', as: 'sales' });
Sale.belongsTo(User, { foreignKey: 'cashierId', as: 'cashier' });

User.hasMany(DayClosure, { foreignKey: 'closedByUserId', as: 'closedDays' });
DayClosure.belongsTo(User, { foreignKey: 'closedByUserId', as: 'closedBy' });

Customer.hasMany(Sale, { foreignKey: 'customerId', as: 'sales' });
Sale.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

Sale.hasMany(SaleItem, { foreignKey: 'saleId', as: 'items' });
SaleItem.belongsTo(Sale, { foreignKey: 'saleId' });

Product.hasMany(SaleItem, { foreignKey: 'productId' });
SaleItem.belongsTo(Product, { foreignKey: 'productId' });

Sale.hasOne(Receipt, { foreignKey: 'saleId', as: 'receipt' });
Receipt.belongsTo(Sale, { foreignKey: 'saleId' });

Shop.hasMany(Expense, { foreignKey: 'shopId', as: 'expenses', onDelete: 'CASCADE', hooks: true });
Expense.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });
Expense.belongsTo(User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });

Shop.hasMany(StockIn, { foreignKey: 'shopId', as: 'stockIns', onDelete: 'CASCADE', hooks: true });
StockIn.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });
StockIn.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Product.hasMany(StockIn, { foreignKey: 'productId', as: 'stockIns' });
StockIn.belongsTo(User, { foreignKey: 'addedByUserId', as: 'addedBy' });

Sale.hasMany(SaleReturn, { foreignKey: 'saleId', as: 'returns' });
SaleReturn.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale' });
SaleReturn.belongsTo(User, { foreignKey: 'processedByUserId', as: 'processedBy' });
Shop.hasMany(SaleReturn, { foreignKey: 'shopId', as: 'saleReturns', onDelete: 'CASCADE', hooks: true });
SaleReturn.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });

SaleReturn.hasMany(SaleReturnItem, { foreignKey: 'returnId', as: 'items' });
SaleReturnItem.belongsTo(SaleReturn, { foreignKey: 'returnId' });
SaleReturnItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Product.hasMany(SaleReturnItem, { foreignKey: 'productId' });

// Audit relationships
Shop.hasMany(Audit, { foreignKey: 'shopId', as: 'audits', onDelete: 'CASCADE', hooks: true });
Audit.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });
Audit.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Stock Reconciliation relationships
Shop.hasMany(StockReconciliation, { foreignKey: 'shopId', as: 'reconciliations', onDelete: 'CASCADE', hooks: true });
StockReconciliation.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });
StockReconciliation.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
StockReconciliation.belongsTo(User, { foreignKey: 'adjustedByUserId', as: 'adjustedBy' });

// Credit sale repayments
Shop.hasMany(CreditPayment, { foreignKey: 'shopId', as: 'creditPayments', onDelete: 'CASCADE', hooks: true });
CreditPayment.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });
Sale.hasMany(CreditPayment, { foreignKey: 'saleId', as: 'creditPayments', onDelete: 'CASCADE' });
CreditPayment.belongsTo(Sale, { foreignKey: 'saleId', as: 'sale', onDelete: 'CASCADE' });
Customer.hasMany(CreditPayment, { foreignKey: 'customerId', as: 'creditPayments', onDelete: 'CASCADE' });
CreditPayment.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer', onDelete: 'CASCADE' });
CreditPayment.belongsTo(User, { foreignKey: 'receivedByUserId', as: 'receivedBy' });

// Suppliers, purchases (goods received) and what is paid to suppliers
Shop.hasMany(Supplier, { foreignKey: 'shopId', as: 'suppliers', onDelete: 'CASCADE', hooks: true });
Supplier.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });
Shop.hasMany(Purchase, { foreignKey: 'shopId', as: 'purchases', onDelete: 'CASCADE', hooks: true });
Purchase.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });
Supplier.hasMany(Purchase, { foreignKey: 'supplierId', as: 'purchases' });
Purchase.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });
Purchase.belongsTo(User, { foreignKey: 'createdByUserId', as: 'createdBy' });
Purchase.hasMany(PurchaseItem, { foreignKey: 'purchaseId', as: 'items', onDelete: 'CASCADE' });
PurchaseItem.belongsTo(Purchase, { foreignKey: 'purchaseId', as: 'purchase', onDelete: 'CASCADE' });
PurchaseItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Shop.hasMany(PurchaseItem, { foreignKey: 'shopId', as: 'purchaseItems', onDelete: 'CASCADE', hooks: true });
PurchaseItem.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });
Shop.hasMany(SupplierPayment, { foreignKey: 'shopId', as: 'supplierPayments', onDelete: 'CASCADE', hooks: true });
SupplierPayment.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });
Supplier.hasMany(SupplierPayment, { foreignKey: 'supplierId', as: 'payments' });
SupplierPayment.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });
Purchase.hasMany(SupplierPayment, { foreignKey: 'purchaseId', as: 'payments', onDelete: 'CASCADE' });
SupplierPayment.belongsTo(Purchase, { foreignKey: 'purchaseId', as: 'purchase', onDelete: 'CASCADE' });
SupplierPayment.belongsTo(User, { foreignKey: 'paidByUserId', as: 'paidBy' });

// Customer-specific prices
Shop.hasMany(CustomerPrice, { foreignKey: 'shopId', as: 'customerPrices', onDelete: 'CASCADE', hooks: true });
CustomerPrice.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });
Customer.hasMany(CustomerPrice, { foreignKey: 'customerId', as: 'specialPrices', onDelete: 'CASCADE' });
CustomerPrice.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer', onDelete: 'CASCADE' });
Product.hasMany(CustomerPrice, { foreignKey: 'productId', as: 'customerPrices', onDelete: 'CASCADE' });
CustomerPrice.belongsTo(Product, { foreignKey: 'productId', as: 'product', onDelete: 'CASCADE' });

// Subscription billing
Shop.hasMany(SubscriptionPayment, { foreignKey: 'shopId', as: 'subscriptionPayments', onDelete: 'CASCADE', hooks: true });
SubscriptionPayment.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });
SubscriptionPayment.belongsTo(User, { foreignKey: 'submittedByUserId', as: 'submittedBy' });
SubscriptionPayment.belongsTo(User, { foreignKey: 'reviewedByUserId', as: 'reviewedBy' });
Shop.hasMany(PaymentRequest, { foreignKey: 'shopId', as: 'paymentRequests', onDelete: 'CASCADE', hooks: true });
PaymentRequest.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop', onDelete: 'CASCADE' });
PaymentRequest.hasMany(SubscriptionPayment, { foreignKey: 'requestId', as: 'payments' });
SubscriptionPayment.belongsTo(PaymentRequest, { foreignKey: 'requestId', as: 'request' });

async function findOrCreateLegacyShop() {
  let shop = await Shop.findOne({ where: { slug: 'stockdesk-shop' } });

  if (!shop) {
    shop = await Shop.create({
      name: 'StockDesk Shop',
      slug: await generateUniqueShopSlug(Shop, 'StockDesk Shop'),
    });
  }

  return shop;
}

async function backfillShopOwnership(shopId) {
  await User.update({ shopId }, { where: { shopId: null } });
  await Customer.update({ shopId }, { where: { shopId: null } });
  await DayClosure.update({ shopId }, { where: { shopId: null } });
  await Product.update({ shopId }, { where: { shopId: null } });
  await Sale.update({ shopId }, { where: { shopId: null } });
  await SaleItem.update({ shopId }, { where: { shopId: null } });
  await Receipt.update({ shopId }, { where: { shopId: null } });
  await Setting.update({ shopId }, { where: { shopId: null } });
}

async function ensureSuperAdmin() {
  const configuredPassword = process.env.SUPERADMIN_PASSWORD ? String(process.env.SUPERADMIN_PASSWORD) : '';
  const configuredName = process.env.SUPERADMIN_NAME ? String(process.env.SUPERADMIN_NAME).trim() : 'Platform Administrator';
  const configuredUsername = process.env.SUPERADMIN_USERNAME ? String(process.env.SUPERADMIN_USERNAME).trim().toLowerCase() : 'superadmin';

  if (!configuredUsername) {
    return;
  }

  let user = await User.findOne({ where: { username: configuredUsername } });

  if (!user) {
    if (!configuredPassword) {
      console.warn('SUPERADMIN_USERNAME is set but SUPERADMIN_PASSWORD is missing. Skipping super admin bootstrap.');
      return;
    }

    const passwordHash = await bcrypt.hash(configuredPassword, 10);
    const username = await generateUniqueUsername(User, {
      username: configuredUsername,
      name: configuredName,
    }, undefined, null);

    await User.create({
      name: configuredName,
      username,
      email: null,
      password: passwordHash,
      role: 'SuperAdmin',
      shopId: null,
      isVerified: true,
      verificationToken: null,
    });

    console.log(`Bootstrapped super admin account for ${username}`);
    return;
  }

  let changed = false;

  if (user.role !== 'SuperAdmin') {
    user.role = 'SuperAdmin';
    changed = true;
  }
  if (!user.isVerified) {
    user.isVerified = true;
    changed = true;
  }
  if (user.verificationToken !== null) {
    user.verificationToken = null;
    changed = true;
  }

  if (changed) {
    await user.save();
    console.log(`Updated ${user.username} to SuperAdmin access`);
  }
}

async function initAppData() {
  const legacyShop = await findOrCreateLegacyShop();

  await backfillShopOwnership(legacyShop.id);
  await backfillMissingUsernames(User);
  // Compare as text: on a fresh database the role enum has no legacy values,
  // and an enum comparison with them would throw and stop the rest of init.
  await sequelize.query(`UPDATE "users" SET "role" = 'Staff' WHERE "role"::text IN ('Cashier', 'Manager')`);
  // NOTE: do NOT blanket-verify all users here - unverified users must click their email link

  const defaultSettings = await Setting.findOne({ where: { shopId: legacyShop.id } });
  if (!defaultSettings) {
    await Setting.create({
      shopName: 'StockDesk Shop',
      address: '123 Commerce Avenue',
      phone: '+1234567890',
      currency: 'USD',
      shopId: legacyShop.id,
    });
  }

  const walkInCustomer = await Customer.findOne({ where: { shopId: legacyShop.id, name: 'Walk-in Customer' } });
  if (!walkInCustomer) {
    await Customer.create({
      name: 'Walk-in Customer',
      phone: null,
      email: null,
      address: null,
      notes: 'Default customer profile for counter sales.',
      shopId: legacyShop.id,
      isActive: true,
    });
  }

  await ensureSuperAdmin();

  const staleCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await PendingSignup.destroy({ where: { createdAt: { [Op.lt]: staleCutoff } } });
}

module.exports = {
  sequelize,
  Shop,
  User,
  PendingSignup,
  Audit,
  StockReconciliation,
  Customer,
  DayClosure,
  Product,
  Sale,
  SaleItem,
  Receipt,
  Setting,
  Expense,
  StockIn,
  SaleReturn,
  SaleReturnItem,
  CreditPayment,
  Supplier,
  Purchase,
  PurchaseItem,
  SupplierPayment,
  SubscriptionPayment,
  PaymentRequest,
  PlatformSetting,
  CustomerPrice,
  initAppData,
};
