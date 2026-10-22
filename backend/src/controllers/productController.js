const { Product, sequelize } = require('../models');
const { Op } = require('sequelize');

exports.listProducts = async (req, res, next) => {
  try {
    const { search, category } = req.query;
    const where = { shopId: req.user.shopId };

    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }
    if (category) {
      where.category = category;
    }

    const products = await Product.findAll({ where, order: [['name', 'ASC']] });
    res.json(products);
  } catch (error) {
    next(error);
  }
};

exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error) {
    next(error);
  }
};

exports.createProduct = async (req, res, next) => {
  try {
    const { name, sku, category, buyPrice, sellPrice, quantity, lowStock } = req.body;
    const product = await Product.create({ name, sku: sku || null, category, buyPrice, sellPrice, quantity, lowStock, shopId: req.user.shopId });
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Whitelist updatable fields — prevents mass-assignment of tenant-scoping
    // columns such as shopId/id from the request body.
    const allowed = ['name', 'sku', 'category', 'buyPrice', 'sellPrice', 'quantity', 'lowStock'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
    await product.update(updates);
    res.json(product);
  } catch (error) {
    next(error);
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const destroyed = await Product.destroy({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!destroyed) return res.status(404).json({ message: 'Product not found' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

exports.lowStockAlerts = async (req, res, next) => {
  try {
    const products = await Product.findAll({
      where: { shopId: req.user.shopId, quantity: { [Op.lte]: sequelize.col('lowStock') } },
    });
    res.json(products);
  } catch (error) {
    next(error);
  }
};

// Bulk restock all products in a category
exports.bulkRestockByCategory = async (req, res, next) => {
  const transaction = await Product.sequelize.transaction();
  try {
    const { category, quantity, costPrice, supplier, notes } = req.body;
    if (!category) {
      await transaction.rollback();
      return res.status(400).json({ message: 'category is required' });
    }
    if (!quantity || Number(quantity) <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'quantity must be a positive number' });
    }

    const items = await Product.findAll({ where: { shopId: req.user.shopId, category }, transaction });
    if (!items || items.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'No products found for this category' });
    }

    const results = [];
    for (const p of items) {
      p.quantity = Number(p.quantity || 0) + Number(quantity);
      if (costPrice !== undefined && costPrice !== null && costPrice !== '') {
        p.buyPrice = parseFloat(costPrice);
      }
      await p.save({ transaction });

      const stockIn = await Product.sequelize.models.StockIn.create(
        {
          productId: p.id,
          quantity: Number(quantity),
          costPrice: costPrice !== undefined ? parseFloat(costPrice) : null,
          supplier: supplier || null,
          notes: notes || null,
          addedByUserId: req.user.id,
          shopId: req.user.shopId,
        },
        { transaction }
      );

      results.push({ id: p.id, name: p.name, newQuantity: p.quantity, stockInId: stockIn.id });
    }

    await transaction.commit();
    res.json({ updated: results.length, results });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};
