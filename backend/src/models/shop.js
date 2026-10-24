const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Shop extends Model {}

Shop.init(
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
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    whatsapp_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    whatsapp_provider: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    whatsapp_sender_number: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    whatsapp_sender_id: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    whatsapp_opt_in_text: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    // Subscription: every shop starts on a free trial; paidUntil is extended
    // by confirmed payments. See utils/subscription.js for how status is worked out.
    plan: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    trialEndsAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    paidUntil: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Owner contact details collected at sign-up, used to reach the shop.
    ownerPhone: {
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
    // Staff logins allowed for this shop, set by the platform owner. NULL means
    // the plan's limit applies.
    staffLimitOverride: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    billingNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lastBillingNotice: {
      type: DataTypes.STRING(48),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Shop',
    tableName: 'shops',
    timestamps: true,
    underscored: false,
    hooks: {
      beforeCreate: async (shop) => {
        if (!shop.trialEndsAt) {
          const { getBillingConfig } = require('../utils/subscription');
          const { trialDays } = await getBillingConfig();
          shop.trialEndsAt = new Date(Date.now() + trialDays * 86400000);
        }
      },
      // Ensure user emails are nulled and users removed when a shop is destroyed
      // (application-level safety; DB-level cascade should still be used in production)
      beforeDestroy: async (shop, options) => {
        const { sequelize } = require('../config/db');
        const User = require('./user');
        const t = options.transaction || (await sequelize.transaction());
        let createdTx = false;
        try {
          if (!options.transaction) createdTx = true;
          await User.update({ email: null, verificationToken: null, resetPasswordToken: null }, { where: { shopId: shop.id }, transaction: t });
          await User.destroy({ where: { shopId: shop.id }, transaction: t });
          if (createdTx) await t.commit();
        } catch (err) {
          if (createdTx) await t.rollback();
          throw err;
        }
      },
    },
  }
);

module.exports = Shop;
