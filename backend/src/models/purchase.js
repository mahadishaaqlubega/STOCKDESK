const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// Goods received from a supplier. Recording one adds the stock; whatever
// is not paid on the day is owed to the supplier (balanceDue).
class Purchase extends Model {}

Purchase.init(
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
    reference: {
      // The supplier's invoice or delivery note number.
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    purchaseDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    total: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    amountPaid: {
      // Paid when the goods arrived; later payments are supplier_payments.
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    balanceDue: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    paymentMethod: {
      type: DataTypes.STRING(16),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdByUserId: {
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
    modelName: 'Purchase',
    tableName: 'purchases',
    timestamps: true,
    underscored: false,
  }
);

module.exports = Purchase;
