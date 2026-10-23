const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Receipt extends Model {}

Receipt.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    receiptNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    publicToken: {
      // Unguessable id for the customer's receipt link (shared on WhatsApp).
      // Unique index in migrations.
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
    modelName: 'Receipt',
    tableName: 'receipts',
    timestamps: true,
    underscored: false,
  }
);

module.exports = Receipt;
