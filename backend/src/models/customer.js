const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Customer extends Model {}

Customer.init(
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
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    creditLimit: {
      // Maximum total the customer may owe. NULL means no limit.
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
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
    modelName: 'Customer',
    tableName: 'customers',
    timestamps: true,
    underscored: false,
  }
);

module.exports = Customer;