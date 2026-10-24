const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class PendingSignup extends Model {}

PendingSignup.init(
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
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    businessType: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    location: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    verificationToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'PendingSignup',
    tableName: 'pending_signups',
    timestamps: true,
    underscored: false,
  }
);

module.exports = PendingSignup;
