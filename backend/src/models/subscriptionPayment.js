const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// A payment for a shop's StockDesk plan. Shops submit Mobile Money payments as
// 'pending' with the transaction ID; the platform owner confirms them, which
// extends the shop's paidUntil. Payments the owner records directly are
// created 'confirmed'.
class SubscriptionPayment extends Model {}

SubscriptionPayment.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    plan: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    months: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    method: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    reference: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    payerPhone: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'pending',
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    requestId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    submittedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    reviewedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    periodStart: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    periodEnd: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'SubscriptionPayment',
    tableName: 'subscription_payments',
    timestamps: true,
    underscored: false,
  }
);

module.exports = SubscriptionPayment;
