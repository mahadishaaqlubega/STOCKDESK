const { Expense, User } = require('../models');
const { Op } = require('sequelize');

exports.listExpenses = async (req, res, next) => {
  try {
    const { start, end } = req.query;
    const where = { shopId: req.user.shopId };
    if (start && end) {
      where.date = { [Op.gte]: start, [Op.lte]: end };
    }
    const expenses = await Expense.findAll({
      where,
      include: [{ model: User, as: 'recordedBy', attributes: ['id', 'name'] }],
      order: [['date', 'DESC'], ['createdAt', 'DESC']],
    });
    res.json(expenses);
  } catch (error) {
    next(error);
  }
};

exports.createExpense = async (req, res, next) => {
  try {
    const { category, description, amount, date, notes } = req.body;
    if (!category || !description || !amount || !date) {
      return res.status(400).json({ message: 'category, description, amount and date are required' });
    }
    const expense = await Expense.create({
      category,
      description,
      amount,
      date,
      notes: notes || null,
      recordedByUserId: req.user.id,
      shopId: req.user.shopId,
    });
    res.status(201).json(expense);
  } catch (error) {
    next(error);
  }
};

exports.updateExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    // Whitelist updatable fields — prevents mass-assignment of shopId/id.
    const allowed = ['category', 'description', 'amount', 'date', 'notes'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
    await expense.update(updates);
    res.json(expense);
  } catch (error) {
    next(error);
  }
};

exports.deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    await expense.destroy();
    res.json({ message: 'Expense deleted' });
  } catch (error) {
    next(error);
  }
};
