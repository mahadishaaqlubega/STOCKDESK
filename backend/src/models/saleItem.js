const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class SaleItem extends Model {}

SaleItem.init(
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
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    listPrice: {
      // Catalogue price when sold; price below it means a per-item discount.
      // NULL on sales made before discounts were recorded per item.
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    costOfGoods: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      defaultValue: 0,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'SaleItem',
    tableName: 'sale_items',
    timestamps: true,
    underscored: false,
  }
);

module.exports = SaleItem;
