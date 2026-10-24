const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// A product price agreed with one customer (loyalty or negotiated). The till
// uses it automatically for that customer. It never goes below the product's
// wholesale price or above its retail price.
class CustomerPrice extends Model {}

CustomerPrice.init(
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
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    updatedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'CustomerPrice',
    tableName: 'customer_prices',
    timestamps: true,
    underscored: false,
  }
);

module.exports = CustomerPrice;
