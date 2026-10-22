const { StockReconciliation, Product, User } = require('../models');
const auditController = require('./auditController');
const { Op } = require('sequelize');
const { parseLocalDate } = require('../config/timezone');
const { startOfDay, endOfDay } = require('../utils/businessMetrics');

// Create stock reconciliation record
exports.createReconciliation = async (req, res) => {
  try {
    const { shopId, id: userId } = req.user;
    const { productId, reason, notes } = req.body;

    if (!productId || req.body.physicalQuantity === undefined || req.body.physicalQuantity === '') {
      return res.status(400).json({ message: 'Product ID and physical quantity are required' });
    }

    const physicalQuantity = Number(req.body.physicalQuantity);
    if (!Number.isInteger(physicalQuantity) || physicalQuantity < 0) {
      return res.status(400).json({ message: 'Physical quantity must be a whole number of 0 or more' });
    }

    const product = await Product.findOne({
      where: { id: productId, shopId },
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    if (product.type === 'service') {
      return res.status(400).json({ message: 'Services do not hold stock and cannot be counted' });
    }

    const systemQuantity = product.quantity;
    const variance = physicalQuantity - systemQuantity;

    const reconciliation = await StockReconciliation.create({
      shopId,
      productId,
      systemQuantity,
      physicalQuantity,
      variance,
      reason,
      adjustedByUserId: userId,
      notes,
      reconciliationDate: new Date(),
    });

    // Log the action
    if (auditController && auditController.logAction) {
      await auditController.logAction(
        userId,
        shopId,
        'CREATE',
        'STOCK_RECONCILIATION',
        reconciliation.id,
        {
          productId,
          systemQuantity,
          physicalQuantity,
          variance,
          reason,
        },
        req
      );
    }

    // If there's a variance, optionally adjust the product quantity
    if (variance !== 0) {
      await Product.update(
        { quantity: physicalQuantity },
        { where: { id: productId, shopId } }
      );

      if (auditController && auditController.logAction) {
        await auditController.logAction(
          userId,
          shopId,
          'UPDATE',
          'PRODUCT',
          productId,
          {
            field: 'quantity',
            oldValue: systemQuantity,
            newValue: physicalQuantity,
            reason: `Stock reconciliation adjustment (${reason || 'not specified'})`,
          },
          req
        );
      }
    }

    res.status(201).json({
      message: 'Stock reconciliation recorded successfully',
      data: reconciliation,
    });
  } catch (error) {
    console.error('Error creating reconciliation:', error);
    res.status(500).json({ message: 'Failed to record reconciliation' });
  }
};

// Get reconciliation history
exports.getReconciliations = async (req, res) => {
  try {
    const { shopId } = req.user;
    const { productId, startDate, endDate, limit = 50, offset = 0 } = req.query;

    const where = { shopId };

    if (productId) where.productId = parseInt(productId);

    if (startDate || endDate) {
      where.reconciliationDate = {};
      if (startDate) where.reconciliationDate[Op.gte] = startOfDay(parseLocalDate(startDate));
      if (endDate) where.reconciliationDate[Op.lte] = endOfDay(parseLocalDate(endDate));
    }

    const { count, rows } = await StockReconciliation.findAndCountAll({
      where,
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'sku'],
        },
        {
          model: User,
          as: 'adjustedBy',
          attributes: ['id', 'name', 'username'],
        },
      ],
      order: [['reconciliationDate', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      total: count,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error('Error fetching reconciliations:', error);
    res.status(500).json({ message: 'Failed to fetch reconciliations' });
  }
};

// Get reconciliation summary by product
exports.getReconciliationSummary = async (req, res) => {
  try {
    const { shopId } = req.user;
    const { startDate, endDate } = req.query;

    const where = { shopId };

    if (startDate || endDate) {
      where.reconciliationDate = {};
      if (startDate) where.reconciliationDate[Op.gte] = startOfDay(parseLocalDate(startDate));
      if (endDate) where.reconciliationDate[Op.lte] = endOfDay(parseLocalDate(endDate));
    }

    const summary = await StockReconciliation.findAll({
      where,
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'sku'],
        },
      ],
      attributes: [
        'productId',
        [require('sequelize').fn('COUNT', '*'), 'reconciliationCount'],
        [require('sequelize').fn('SUM', require('sequelize').col('variance')), 'totalVariance'],
        [require('sequelize').fn('AVG', require('sequelize').col('variance')), 'avgVariance'],
      ],
      group: ['productId', 'product.id', 'product.name', 'product.sku'],
      raw: true,
      subQuery: false,
      // Quoted: unquoted identifiers are lower-cased by Postgres and would not
      // match the camelCase alias, failing every request.
      order: [[require('sequelize').literal('"totalVariance"'), 'DESC']],
    });

    res.json(summary);
  } catch (error) {
    console.error('Error fetching reconciliation summary:', error);
    res.status(500).json({ message: 'Failed to fetch reconciliation summary' });
  }
};

// Get products for reconciliation (showing current system quantities)
exports.getProductsForReconciliation = async (req, res) => {
  try {
    const { shopId } = req.user;
    const { search } = req.query;

    const where = { shopId, isActive: true, type: 'goods' };

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { sku: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const products = await Product.findAll({
      where,
      attributes: ['id', 'name', 'sku', 'quantity', 'buyPrice', 'sellPrice'],
      order: [['name', 'ASC']],
      limit: 100,
    });

    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
};
