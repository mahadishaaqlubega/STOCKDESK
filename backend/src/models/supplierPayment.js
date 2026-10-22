const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// Money paid to a supplier against an unpaid purchase. One payment from
// the till can be split across several purchases (same paymentGroup).
class SupplierPayment extends Model {}

SupplierPayment.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    supplierId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    purchaseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    method: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    paymentGroup: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    paidByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'SupplierPayment',
    tableName: 'supplier_payments',
    timestamps: true,
    underscored: false,
  }
);

module.exports = SupplierPayment;
