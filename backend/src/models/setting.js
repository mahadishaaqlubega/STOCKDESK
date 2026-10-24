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
    maxDiscountPercent: {
      // Largest discount staff may give on a sale, as a % of its catalogue
      // value. NULL = no limit. Admins are never limited.
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    // Automatic emails (all off until the shop turns them on).
    autoEmailReceipts: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    autoEmailPaymentThanks: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    autoEmailReminders: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reminderDaysBefore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
    reminderRepeatDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 7 },
    ownerDailySummary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    lastDailySummaryDate: { type: DataTypes.DATEONLY, allowNull: true },
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
