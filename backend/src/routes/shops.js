const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const Shop = require('../models/shop');
const whatsappService = require('../services/whatsappService');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const rateLimit = require('express-rate-limit');
const Audit = require('../models/audit');

router.use(authenticate);

// Get current shop info
router.get('/me', async (req, res) => {
  try {
    const shopId = req.user.shopId;
    if (!shopId) return res.status(404).json({ error: 'No shop associated with user' });
    const shop = await Shop.findByPk(shopId);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    res.json(shop);
  } catch (err) {
    console.error('Get shop error:', err);
    res.status(500).json({ error: 'Failed to get shop' });
  }
});

// Update shop whatsapp settings (Admin only)
router.put('/me', authorize(['Admin']), async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const { whatsapp_sender_number, whatsapp_provider, whatsapp_opt_in_text } = req.body;

    const shop = await Shop.findByPk(shopId);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    if (whatsapp_sender_number) {
      const parsed = parsePhoneNumberFromString(whatsapp_sender_number || '');
      if (!parsed || !parsed.isValid()) {
        return res.status(400).json({ error: 'Invalid sender phone number format' });
      }
      shop.whatsapp_sender_number = parsed.number;
    }

    if (whatsapp_provider) shop.whatsapp_provider = whatsapp_provider;
    if (typeof whatsapp_opt_in_text !== 'undefined') shop.whatsapp_opt_in_text = whatsapp_opt_in_text;

    await shop.save();
    res.json({ success: true, shop });
  } catch (err) {
    console.error('Update shop error:', err);
    res.status(500).json({ error: 'Failed to update shop' });
  }
});

// Verify sender by sending a test message (Admin only)
const verifyWhatsappLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // verification attempts per hour
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many verification attempts. Try again later.' }),
});

router.post('/me/whatsapp/verify', authorize(['Admin']), verifyWhatsappLimiter, async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const { senderNumber, adminPhone } = req.body;

    if (!senderNumber || !adminPhone) {
      return res.status(400).json({ error: 'senderNumber and adminPhone required' });
    }

    const parsedSender = parsePhoneNumberFromString(senderNumber || '');
    const parsedAdmin = parsePhoneNumberFromString(adminPhone || '');
    if (!parsedSender || !parsedSender.isValid() || !parsedAdmin || !parsedAdmin.isValid()) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const shop = await Shop.findByPk(shopId);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    // Attempt to send a verification message
    const provider = shop.whatsapp_provider || 'twilio';
    const fromNumber = parsedSender.number;
    const toNumber = parsedAdmin.number;
    const body = `Verification message from ${shop.name || 'your shop'} — reply to confirm.`;

    const result = await whatsappService.sendText({ provider, fromNumber, toNumber, body });

    // If successful, store sender number and enable Whatsapp for shop
    shop.whatsapp_sender_number = parsedSender.number;
    shop.whatsapp_enabled = true;
    await shop.save();

    try {
      await Audit.create({
        userId: req.user.id,
        shopId: shop.id,
        action: 'VERIFY_WHATSAPP',
        entityType: 'SHOP',
        entityId: shop.id,
        details: { senderNumber: parsedSender.number, adminPhone: parsedAdmin.number, sid: result.sid || result.messageSid || null },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || null,
      });
    } catch (err) {
      console.warn('Failed to write audit log for WhatsApp verification:', err.message || err);
    }

    res.json({ success: true, sid: result.sid || result.messageSid || null });
  } catch (err) {
    console.error('Verify whatsapp error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
