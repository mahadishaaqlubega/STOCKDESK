const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// A request from the platform owner asking a shop to pay for its plan. The
// shop sees it as a banner and on its Billing page until it is paid or
// cancelled.
class PaymentRequest extends Model {}

PaymentRequest.init(
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
    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'open',
    },
    emailedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'PaymentRequest',
    tableName: 'payment_requests',
    timestamps: true,
    underscored: false,
  }
);

module.exports = PaymentRequest;
