const { StockIn, Product, User } = require('../models');

exports.restockProduct = async (req, res, next) => {
  // Opened inside try: if the pool is exhausted the error must reach
  // next() instead of escaping as an unhandled rejection.
  let transaction;
  try {
    transaction = await Product.sequelize.transaction();
    const product = await Product.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }
    if (product.type === 'service') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Services do not hold stock and cannot be restocked' });
    }

    const { quantity, costPrice, supplier, notes } = req.body;
    if (!quantity || Number(quantity) <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'quantity must be a positive number' });
    }

    product.quantity = Number(product.quantity || 0) + Number(quantity);
    if (costPrice !== undefined && costPrice !== null && costPrice !== '') {
      product.buyPrice = parseFloat(costPrice);
    }
    await product.save({ transaction });

    const stockIn = await StockIn.create(
      {
        productId: product.id,
        quantity: Number(quantity),
        costPrice: costPrice !== undefined ? parseFloat(costPrice) : null,
        supplier: supplier || null,
        notes: notes || null,
        addedByUserId: req.user.id,
        shopId: req.user.shopId,
      },
      { transaction }
    );

    await transaction.commit();
    res.status(201).json({ stockIn, newQuantity: product.quantity });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
};

exports.stockHistory = async (req, res, next) => {
  try {
    const history = await StockIn.findAll({
      where: { productId: req.params.id, shopId: req.user.shopId },
      include: [{ model: User, as: 'addedBy', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
    res.json(history);
  } catch (error) {
    next(error);
  }
};
