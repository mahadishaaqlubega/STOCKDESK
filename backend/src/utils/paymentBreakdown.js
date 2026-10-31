const { fn, col, Op } = require('sequelize');
const { Sale, CreditPayment, SaleReturn } = require('../models');

const TENDERS = ['Cash', 'Mobile Money', 'Card'];

const emptyTenders = () => Object.fromEntries(TENDERS.map((method) => [method, 0]));

// What one Split or Credit sale took in each tender: its split lines, or a
// credit sale's deposit. The part left on credit is not money received.
function tendersFromSplits(splits) {
  const out = emptyTenders();
  let lines = splits;
  if (typeof lines === 'string') {
    try {
      lines = JSON.parse(lines);
    } catch {
      lines = null;
    }
  }
  if (!Array.isArray(lines)) return out;
  for (const line of lines) {
    if (line && TENDERS.includes(line.method)) out[line.method] += Number(line.amount || 0);
  }
  return out;
}

// Money received between two moments, by Cash, Mobile Money and Card: sales
// (whole single-method sales, split lines, credit deposits) plus payments
// customers made on what they owe. Also what was sold on credit and the cash
// handed back for returns, so the owner can tie it to the drawer.
async function paymentBreakdown(shopId, start, end) {
  const createdAt = { [Op.gte]: start, [Op.lte]: end };
  const [singleRows, splitRows, debtRows, soldOnCredit, cashRefunds] = await Promise.all([
    Sale.findAll({
      where: { shopId, createdAt, paymentMethod: TENDERS },
      attributes: ['paymentMethod', [fn('SUM', col('total')), 'amount']],
      group: ['paymentMethod'],
      raw: true,
    }),
    Sale.findAll({
      where: { shopId, createdAt, paymentMethod: ['Split', 'Credit'] },
      attributes: ['paymentSplits'],
      raw: true,
    }),
    CreditPayment.findAll({
      where: { shopId, createdAt },
      attributes: ['method', [fn('SUM', col('amount')), 'amount']],
      group: ['method'],
      raw: true,
    }),
    Sale.sum('creditAmount', { where: { shopId, createdAt } }),
    SaleReturn.sum('cashRefund', { where: { shopId, createdAt } }),
  ]);

  const sales = emptyTenders();
  for (const row of singleRows) {
    if (TENDERS.includes(row.paymentMethod)) sales[row.paymentMethod] += Number(row.amount || 0);
  }
  for (const row of splitRows) {
    const lines = tendersFromSplits(row.paymentSplits);
    for (const method of TENDERS) sales[method] += lines[method];
  }
  const debtPayments = emptyTenders();
  for (const row of debtRows) {
    if (TENDERS.includes(row.method)) debtPayments[row.method] += Number(row.amount || 0);
  }

  const round = (value) => Math.round(value * 100) / 100;
  const methods = TENDERS.map((method) => ({
    method,
    sales: round(sales[method]),
    debtPayments: round(debtPayments[method]),
    total: round(sales[method] + debtPayments[method]),
  }));
  return {
    methods,
    total: round(methods.reduce((sum, m) => sum + m.total, 0)),
    soldOnCredit: round(Number(soldOnCredit || 0)),
    cashRefunds: round(Number(cashRefunds || 0)),
  };
}

module.exports = { paymentBreakdown, tendersFromSplits, TENDERS };
