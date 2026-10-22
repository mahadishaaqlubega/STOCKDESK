const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class PurchaseItem extends Model {}

PurchaseItem.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    purchaseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    unitCost: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'PurchaseItem',
    tableName: 'purchase_items',
    timestamps: true,
    underscored: false,
  }
);

module.exports = PurchaseItem;
