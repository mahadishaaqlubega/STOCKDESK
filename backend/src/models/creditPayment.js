const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// A repayment against a credit sale. One customer payment that clears several
// sales is stored as one row per sale, sharing the same receiptGroup.
class CreditPayment extends Model {}

CreditPayment.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    method: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'Cash',
    },
    receiptGroup: {
      type: DataTypes.STRING(36),
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    receivedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'CreditPayment',
    tableName: 'credit_payments',
    timestamps: true,
    underscored: false,
  }
);

module.exports = CreditPayment;
