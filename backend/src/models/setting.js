const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Setting extends Model {}

Setting.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    shopName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD',
    },
    vat: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'VAT percentage',
    },
    receiptHeader: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Custom receipt header text',
    },
    receiptFooter: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Custom receipt footer text',
    },
    shopLogoUrl: {
      // TEXT: holds either an https URL or an uploaded logo as a data: URL.
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'URL to shop logo for receipts',
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Setting',
    tableName: 'settings',
    timestamps: true,
    underscored: false,
  }
);

module.exports = Setting;
