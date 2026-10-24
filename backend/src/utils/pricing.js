// Which catalogue price a customer pays for a product, in priority order:
//   1. a special price saved for this customer
//   2. the wholesale price (wholesale customer or admin switch, quantity met)
//   3. the customer's loyalty % off retail
//   4. retail
// The wholesale price is the lowest staff may go and the lowest a loyalty
// discount reaches (cost when there is no wholesale price). Admins may go
// lower; a special price is set by an admin and is used as saved.

const roundShillings = (n) => Math.round(Number(n) || 0);

function linePrice({ product, quantity, customer, specialPrice, wholesaleSale }) {
  const retail = parseFloat(product.sellPrice) || 0;
  const wholesale = product.wholesalePrice == null ? null : parseFloat(product.wholesalePrice);
  const cost = parseFloat(product.buyPrice) || 0;
  const floor = wholesale;

  if (specialPrice != null) {
    // Set by an admin, so it may sit below the wholesale price.
    const price = Math.min(retail, Number(specialPrice));
    return { listPrice: price, source: 'special', floor, retail };
  }
  if (wholesaleSale && wholesale != null && quantity >= (product.wholesaleMinQty || 1)) {
    return { listPrice: wholesale, source: 'wholesale', floor, retail };
  }
  const loyalty = customer && customer.loyaltyPercent != null ? Number(customer.loyaltyPercent) : 0;
  if (loyalty > 0 && retail > 0) {
    let price = roundShillings(retail * (1 - loyalty / 100));
    price = Math.max(price, floor != null ? floor : Math.min(cost, retail));
    if (price < retail) return { listPrice: price, source: 'loyalty', floor, retail };
  }
  return { listPrice: retail, source: 'retail', floor, retail };
}

module.exports = { linePrice };
