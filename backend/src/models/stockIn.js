const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class StockIn extends Model {}

StockIn.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    costPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    supplier: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    purchaseId: {
      // Set when the stock came in through a recorded purchase.
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    addedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'StockIn',
    tableName: 'stock_ins',
    timestamps: true,
    underscored: false,
  }
);

module.exports = StockIn;
