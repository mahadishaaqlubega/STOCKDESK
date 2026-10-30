const { Expense, User } = require('../models');
const { Op } = require('sequelize');

const EXPENSE_METHODS = ['Cash', 'Mobile Money', 'Bank', 'Card', 'Other'];

// Returns an error message, or null when the fields are usable. `partial`
// checks only the fields present (for edits).
function expenseProblem(body, partial = false) {
  const has = (field) => body[field] !== undefined;
  if (!partial || has('amount')) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e11) return 'Amount must be a number above 0';
  }
  if (!partial || has('date')) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ''))) return 'Date must be YYYY-MM-DD';
  }
  for (const field of ['category', 'description']) {
    if (!partial || has(field)) {
      const value = String(body[field] ?? '').trim();
      if (!value || value.length > 255) return `${field} is required (at most 255 characters)`;
    }
  }
  if (has('notes') && body.notes != null && String(body.notes).length > 2000) return 'Notes are too long';
  if (has('method') && body.method != null && !EXPENSE_METHODS.includes(body.method)) {
    return `Paid with must be one of ${EXPENSE_METHODS.join(', ')}`;
  }
  return null;
}

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
    const { category, description, amount, date, notes, method } = req.body;
    if (!category || !description || !amount || !date) {
      return res.status(400).json({ message: 'category, description, amount and date are required' });
    }
    const problem = expenseProblem(req.body);
    if (problem) return res.status(400).json({ message: problem });
    const expense = await Expense.create({
      category,
      description,
      amount,
      date,
      notes: notes || null,
      method: method || null,
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

    // Whitelist updatable fields - prevents mass-assignment of shopId/id.
    const problem = expenseProblem(req.body, true);
    if (problem) return res.status(400).json({ message: problem });
    const allowed = ['category', 'description', 'amount', 'date', 'notes', 'method'];
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
