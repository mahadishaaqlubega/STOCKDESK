const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// A quotation or proforma invoice: prices offered to a customer before they
// buy. Lines are kept on the document itself (JSON), so later price changes
// never alter a quote already sent. When the customer accepts, the till sells
// it as a normal sale and the quote points at that sale.
class Quotation extends Model {}

Quotation.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Per-shop sequence shared by quotations and proformas',
    },
    docType: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'quotation',
      comment: "'quotation' or 'proforma'",
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    billToName: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    billToPhone: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    billToEmail: {
      type: DataTypes.STRING(160),
      allowNull: true,
    },
    billToAddress: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    items: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: '[{ productId|null, name, quantity, price, lineTotal }]',
    },
    subtotal: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    discount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    taxRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },
    taxAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    total: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'UGX',
    },
    validUntil: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'open',
      comment: "'open', 'converted' or 'cancelled' (expired is worked out from validUntil)",
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    publicToken: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    createdByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Quotation',
    tableName: 'quotations',
    timestamps: true,
    underscored: false,
  }
);

module.exports = Quotation;
