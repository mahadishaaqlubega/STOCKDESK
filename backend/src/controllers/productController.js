const { Product, sequelize } = require('../models');
const { Op } = require('sequelize');

const PRODUCT_TYPES = ['goods', 'service'];

// Services are sold without a stock count, so their stock fields are pinned
// to zero and can never trigger low-stock warnings.
function applyTypeRules(fields) {
  if (fields.type === undefined) return fields;
  if (!PRODUCT_TYPES.includes(fields.type)) {
    throw Object.assign(new Error('type must be "goods" or "service"'), { status: 400 });
  }
  if (fields.type === 'service') {
    return { ...fields, quantity: 0, lowStock: 0 };
  }
  return fields;
}

exports.listProducts = async (req, res, next) => {
  try {
    const { search, category, type } = req.query;
    const where = { shopId: req.user.shopId };
    if (PRODUCT_TYPES.includes(type)) {
      where.type = type;
    }

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
    const { name, sku, category, buyPrice, sellPrice, quantity, lowStock, type = 'goods' } = req.body;
    const fields = applyTypeRules({ name, sku: sku || null, category, buyPrice, sellPrice, quantity, lowStock, type });
    const product = await Product.create({ ...fields, shopId: req.user.shopId });
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
    const allowed = ['name', 'sku', 'category', 'buyPrice', 'sellPrice', 'quantity', 'lowStock', 'type'];
    let updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
    updates = applyTypeRules({ type: updates.type ?? product.type, ...updates });
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
      where: { shopId: req.user.shopId, type: 'goods', quantity: { [Op.lte]: sequelize.col('lowStock') } },
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

    const items = await Product.findAll({
      where: { shopId: req.user.shopId, category, type: 'goods' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
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
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
};
