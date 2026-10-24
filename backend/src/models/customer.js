const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Customer extends Model {}

Customer.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    whatsapp: {
      // WhatsApp number when it differs from `phone`; NULL = use phone.
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    // When an automatic payment reminder was last emailed.
    lastEmailReminderAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastReminderAt: {
      // When a debt reminder was last sent, so staff don't nag twice.
      type: DataTypes.DATE,
      allowNull: true,
    },
    creditLimit: {
      // Maximum total the customer may owe. NULL means no limit.
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    // 'retail' or 'wholesale': wholesale customers get products' wholesale prices.
    priceTier: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'retail',
    },
    // Loyalty discount off retail prices, never below a product's wholesale price.
    loyaltyPercent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Customer',
    tableName: 'customers',
    timestamps: true,
    underscored: false,
  }
);

module.exports = Customer;