const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class User extends Model {}

User.init(
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
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    avatarUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    role: {
      type: DataTypes.ENUM('SuperAdmin', 'Admin', 'Staff'),
      allowNull: false,
      defaultValue: 'Staff',
    },
    displayRole: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    verificationToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    resetPasswordToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    resetPasswordExpiry: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    tokenVersion: {
      // Bumped to end every existing session (password change/reset).
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    failedLoginCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lockedUntil: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Two-step sign-in (utils/totp.js). Secrets are encrypted; recovery codes
    // are stored only as hashes.
    totpSecret: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    totpPendingSecret: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    totpEnabledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    totpLastStep: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    totpRecoveryCodes: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true,
    underscored: false,
    indexes: [
      {
        unique: true,
        fields: ['shopId', 'username'],
      },
    ],
  }
);

// Two-step secrets never leave the server, whatever a query selected.
const PRIVATE_FIELDS = ['totpSecret', 'totpPendingSecret', 'totpRecoveryCodes', 'totpLastStep'];
User.prototype.toJSON = function toJSON() {
  const values = { ...this.get() };
  PRIVATE_FIELDS.forEach((field) => delete values[field]);
  return values;
};

module.exports = User;
