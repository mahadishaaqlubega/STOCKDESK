const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// One shift on the shop's cash drawer: opened with a float, closed with the
// cash counted. Only one can be open per shop at a time (partial unique index
// in migrations.js). What the drawer should hold is worked out at closing and
// kept here, so later edits elsewhere never change a closed count.
class TillSession extends Model {}

TillSession.init(
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
    openedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    openedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    openingFloat: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    openingNote: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    closedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    countedCash: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    expectedCash: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    difference: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      comment: 'countedCash - expectedCash: negative is short, positive is over',
    },
    breakdown: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    denominations: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    closingNote: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'TillSession',
    tableName: 'till_sessions',
    timestamps: true,
    underscored: false,
  }
);

module.exports = TillSession;
