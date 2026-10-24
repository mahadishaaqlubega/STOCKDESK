const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// An email the platform owner sent to shop owners from the console.
class PlatformMessage extends Model {}

PlatformMessage.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    subject: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    audience: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    template: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    recipientCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    sentCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    failedCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'sending',
    },
    recipients: {
      // [{ shopId, shopName, email, status, error }]
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    createdByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'PlatformMessage',
    tableName: 'platform_messages',
    timestamps: true,
    underscored: false,
  }
);

module.exports = PlatformMessage;
