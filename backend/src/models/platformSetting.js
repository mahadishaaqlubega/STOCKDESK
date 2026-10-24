const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// Platform-wide settings the owner edits from the console (for example plan
// prices and the Mobile Money numbers shops pay to), stored as JSON per key.
class PlatformSetting extends Model {}

PlatformSetting.init(
  {
    key: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'PlatformSetting',
    tableName: 'platform_settings',
    timestamps: true,
    underscored: false,
  }
);

module.exports = PlatformSetting;
