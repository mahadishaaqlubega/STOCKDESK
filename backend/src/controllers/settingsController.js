const { Setting, Shop } = require('../models');

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await Setting.findOne({
      where: { shopId: req.user.shopId },
      include: [{ model: Shop, as: 'shop', attributes: ['id', 'name', 'slug'] }],
    });
    res.json(settings);
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const settings = await Setting.findOne({ where: { shopId: req.user.shopId } });
    if (!settings) return res.status(404).json({ message: 'Settings not found' });

    // Whitelist updatable fields — prevents a shop admin from reassigning
    // shopId and taking over another tenant's settings row.
    const allowed = ['shopName', 'address', 'phone', 'currency', 'vat', 'receiptHeader', 'receiptFooter', 'shopLogoUrl'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
    await settings.update(updates);
    res.json(settings);
  } catch (error) {
    next(error);
  }
};
