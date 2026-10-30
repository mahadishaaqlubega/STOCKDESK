const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// Cash put into or taken out of the drawer during a till session that is not
// a sale or payment: change brought in, the owner taking cash home, etc.
class TillMovement extends Model {}

TillMovement.init(
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
    sessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(8),
      allowNull: false,
      comment: "'in' or 'out'",
    },
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'TillMovement',
    tableName: 'till_movements',
    timestamps: true,
    underscored: false,
  }
);

module.exports = TillMovement;
