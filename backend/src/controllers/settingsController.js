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
    const allowed = ['shopName', 'address', 'phone', 'currency', 'vat', 'receiptHeader', 'receiptFooter', 'shopLogoUrl', 'maxDiscountPercent'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
    if (updates.maxDiscountPercent !== undefined) {
      if (updates.maxDiscountPercent === null || updates.maxDiscountPercent === '') {
        updates.maxDiscountPercent = null;
      } else {
        const percent = Number(updates.maxDiscountPercent);
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
          return res.status(400).json({ message: 'Staff discount limit must be between 0 and 100%.' });
        }
        updates.maxDiscountPercent = percent;
      }
    }
    if (updates.shopLogoUrl) {
      const logo = String(updates.shopLogoUrl);
      const isImageData = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo);
      const isHttpsUrl = /^https:\/\/[^\s]+$/.test(logo) && logo.length <= 2048;
      if (!isImageData && !isHttpsUrl) {
        return res.status(400).json({ message: 'Logo must be a PNG, JPEG or WebP image, or an https link.' });
      }
      // ~300 KB of image data is plenty for a receipt logo.
      if (isImageData && logo.length > 400000) {
        return res.status(400).json({ message: 'Logo image is too large. Use an image under 300 KB.' });
      }
    }
    await settings.update(updates);
    res.json(settings);
  } catch (error) {
    next(error);
  }
};
