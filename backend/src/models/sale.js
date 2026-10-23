const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Sale extends Model {}

Sale.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    cashierId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    paymentMethod: {
      type: DataTypes.ENUM('Cash', 'Card', 'Mobile Money', 'Split', 'Credit'),
      allowNull: false,
    },
    paymentSplits: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Array of {method, amount} for split payments',
    },
    tax: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'VAT percentage applied',
    },
    taxAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Actual tax amount charged',
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD',
    },
    discount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    discountType: {
      type: DataTypes.ENUM('percentage', 'fixed'),
      allowNull: false,
      defaultValue: 'fixed',
    },
    creditAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Amount put on credit when the sale was made (never changes)',
    },
    balanceDue: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Amount the customer still owes on this sale',
    },
    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    clientRef: {
      // Id the till generated for this sale. Makes checkout idempotent: a
      // sale sent twice (offline queue retry, lost response) is stored once.
      // Unique per shop (index in migrations).
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Sale',
    tableName: 'sales',
    timestamps: true,
    underscored: false,
  }
);

module.exports = Sale;
