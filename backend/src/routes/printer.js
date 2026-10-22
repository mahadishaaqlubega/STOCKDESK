const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const Sale = require('../models/sale');
const Receipt = require('../models/receipt');
const User = require('../models/user');
const Product = require('../models/product');
const Setting = require('../models/setting');
const Shop = require('../models/shop');
const whatsappService = require('../services/whatsappService');
const rateLimit = require('express-rate-limit');
const Audit = require('../models/audit');

function getPrinterService() {
  return require('../services/printerService').getPrinterService();
}

/**
 * Configure printer connection
 * POST /api/printer/configure
 */
router.post('/configure', authenticate, authorize(['Admin']), async (req, res) => {
  try {
    const { type, vendorId, productId, ip, port } = req.body;

    if (!type || !['usb', 'network'].includes(type)) {
      return res.status(400).json({ error: 'Invalid printer type. Must be "usb" or "network"' });
    }

    const printerService = getPrinterService();

    // Prepare settings based on type
    const settings = { type };
    if (type === 'usb') {
      settings.vendorId = vendorId || 0x04b8; // Default Epson vendor ID
      settings.productId = productId || 0x0202; // Default Epson product ID
    } else if (type === 'network') {
      if (!ip || !port) {
        return res.status(400).json({ error: 'IP and port required for network printer' });
      }
      settings.ip = ip;
      settings.port = parseInt(port);
    }

    // Try to connect
    await printerService.connect(settings);

    res.json({
      success: true,
      message: `Printer configured successfully (${type})`,
      status: printerService.getStatus(),
    });
  } catch (error) {
    console.error('Printer configuration error:', error);
    res.status(500).json({ error: 'Failed to configure printer' });
  }
});

/**
 * Get printer status
 * GET /api/printer/status
 */
router.get('/status', authenticate, (req, res) => {
  try {
    const printerService = getPrinterService();
    const status = printerService.getStatus();

    res.json({
      connected: status.connected,
      type: status.type,
      width: status.width,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get printer status' });
  }
});

/**
 * Test print
 * POST /api/printer/test
 */
router.post('/test', authenticate, authorize(['Admin']), async (req, res) => {
  try {
    const printerService = getPrinterService();

    if (!printerService.isConnected()) {
      return res.status(400).json({ error: 'Printer not connected. Please configure first.' });
    }

    await printerService.testPrint();

    res.json({
      success: true,
      message: 'Test print sent to printer',
    });
  } catch (error) {
    console.error('Test print error:', error);
    res.status(500).json({ error: 'Test print failed' });
  }
});

/**
 * Print receipt directly to thermal printer
 * POST /api/printer/print-receipt
 */
router.post('/print-receipt', authenticate, async (req, res) => {
  try {
    const { saleId } = req.body;
    const { shopId } = req.user;

    if (!saleId) {
      return res.status(400).json({ error: 'saleId is required' });
    }
    if (!shopId) {
      return res.status(403).json({ error: 'Shop-scoped user required' });
    }

    const printerService = getPrinterService();

    if (!printerService.isConnected()) {
      return res.status(400).json({
        error: 'Printer not connected',
        fallback: true, // Signal frontend to use window.print()
      });
    }

    // Fetch sale with items and product details
    const sale = await Sale.findOne({
      where: { id: saleId, shopId },
      include: [
        {
          association: 'items',
          where: { shopId },
          required: false,
          attributes: ['productId', 'price', 'quantity'],
          include: [
            {
              association: 'Product',
              attributes: ['name'],
            },
          ],
        },
        {
          association: 'cashier',
          attributes: ['username'],
        },
      ],
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Fetch receipt number
    const receipt = await Receipt.findOne({
      where: { saleId, shopId },
      attributes: ['receiptNumber'],
    });

    // Fetch settings for shop info
    const settings = await Setting.findOne({ where: { shopId } });

    // Prepare print data
    const printData = {
      receiptNumber: receipt?.receiptNumber || `#${saleId}`,
      items: sale.items.map((item) => ({
        name: item.Product?.name || 'Unknown',
        price: item.price,
        quantity: item.quantity,
      })),
      subtotal: parseFloat(sale.total) + parseFloat(sale.discount || 0),
      discount: sale.discount || 0,
      discountType: sale.discountType,
      total: sale.total,
      currency: sale.currency || 'USD',
      paymentMethod: sale.paymentMethod,
      cashierName: sale.cashier?.username || 'Unknown',
      shopName: settings?.shopName || 'StockDesk',
      address: settings?.address || '',
      phone: settings?.phone || '',
    };

    // Print to thermal printer
    await printerService.printReceipt(printData, {
      shopName: printData.shopName,
      address: printData.address,
      phone: printData.phone,
    });

    res.json({
      success: true,
      message: 'Receipt printed successfully',
    });
  } catch (error) {
    console.error('Print receipt error:', error);
    res.status(500).json({
      error: 'Failed to print receipt',
      fallback: true, // Signal frontend to use window.print()
    });
  }
});

/**
 * Disconnect printer
 * POST /api/printer/disconnect
 */
router.post('/disconnect', authenticate, authorize(['Admin']), (req, res) => {
  try {
    const printerService = getPrinterService();
    printerService.disconnect();

    res.json({
      success: true,
      message: 'Printer disconnected',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect printer' });
  }
});

/**
 * Send receipt via WhatsApp
 * POST /api/printer/send-whatsapp
 */
const sendWhatsappLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each user/IP to 10 requests per windowMs
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many WhatsApp send attempts. Try again later.' }),
});

router.post('/send-whatsapp', authenticate, sendWhatsappLimiter, async (req, res) => {
  try {
    const { saleId, to } = req.body;
    const { shopId } = req.user;

    if (!saleId || !to) {
      return res.status(400).json({ error: 'saleId and to (phone) are required' });
    }
    if (!shopId) {
      return res.status(403).json({ error: 'Shop-scoped user required' });
    }

    const sale = await Sale.findOne({
      where: { id: saleId, shopId },
      include: [
        {
          association: 'items',
          where: { shopId },
          required: false,
          attributes: ['productId', 'price', 'quantity'],
          include: [
            {
              association: 'Product',
              attributes: ['name'],
            },
          ],
        },
        {
          association: 'cashier',
          attributes: ['username'],
        },
      ],
    });

    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const receipt = await Receipt.findOne({ where: { saleId, shopId }, attributes: ['receiptNumber'] });
    const settings = (await Setting.findOne({ where: { shopId } })) || {};
    const shop = await Shop.findByPk(shopId);

    const provider = shop?.whatsapp_provider || 'twilio';
    const fromNumber = shop?.whatsapp_sender_number || process.env.TWILIO_WHATSAPP_NUMBER;

    if (!fromNumber) {
      return res.status(400).json({ error: 'No WhatsApp sender number configured for this shop or server' });
    }

    // Attach receipt number and shop info into settings for the PDF generator
    const pdfSettings = Object.assign({}, settings, {
      shopName: settings.shopName || shop?.name || 'StockDesk',
      shopLogoUrl: settings.shopLogoUrl,
      address: settings.address,
      phone: settings.phone,
    });

    const result = await whatsappService.sendReceipt({
      provider,
      fromNumber,
      toNumber: to,
      sale: Object.assign({}, sale.get ? sale.get() : sale, { receipt: { receiptNumber: receipt?.receiptNumber } }),
      settings: pdfSettings,
    });

    // Audit log
    try {
      await Audit.create({
        userId: req.user.id,
        shopId,
        action: 'SEND_WHATSAPP',
        entityType: 'SALE',
        entityId: sale.id,
        details: { to, provider, sid: result.sid || result.messageSid || null },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || null,
      });
    } catch (err) {
      console.warn('Failed to write audit log for WhatsApp send:', err.message || err);
    }

    res.json({ success: true, sid: result.sid || result.messageSid || null });
  } catch (error) {
    console.error('Send WhatsApp error:', error);
    res.status(500).json({ error: 'Failed to send WhatsApp receipt' });
  }
});

module.exports = router;

