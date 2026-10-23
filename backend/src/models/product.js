const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Product extends Model {}

Product.init(
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
    sku: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    buyPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    sellPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lowStock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    type: {
      // 'goods' are stock-tracked; 'service' items (repairs, labour, fees)
      // are sold without any stock count.
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'goods',
      validate: { isIn: [['goods', 'service']] },
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
    modelName: 'Product',
    tableName: 'products',
    timestamps: true,
    underscored: false,
  }
);

module.exports = Product;
