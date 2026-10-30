const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class SaleReturn extends Model {}

SaleReturn.init(
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
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    totalRefund: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    cashRefund: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      comment: 'Part of the refund handed back from the till (the rest cancelled credit)',
    },
    processedByUserId: {
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
    modelName: 'SaleReturn',
    tableName: 'sale_returns',
    timestamps: true,
    underscored: false,
  }
);

module.exports = SaleReturn;
