require('./setup');
const { renderEmail } = require('../src/services/emailService');

describe('email template', () => {
  it('escapes user text and includes the button link and plain-text version', () => {
    const { html, text } = renderEmail({
      heading: 'Hello <b>there</b>',
      paragraphs: ['Shop "A & B" <script>'],
      details: [['Total', 'UGX 10,000', { strong: true }]],
      cta: { label: 'Open', url: 'https://app.stockdeskinventory.com/app' },
    });
    expect(html).toContain('Hello &lt;b&gt;there&lt;/b&gt;');
    expect(html).toContain('Shop &quot;A &amp; B&quot; &lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('href="https://app.stockdeskinventory.com/app"');
    expect(text).toContain('Total: UGX 10,000');
    expect(text).toContain('Open: https://app.stockdeskinventory.com/app');
  });

  it('shows the shop in the footer for receipts', () => {
    const { html } = renderEmail({ heading: 'Receipt', fromShop: { name: 'Kato Store', phone: '0700' } });
    expect(html).toContain('Kato Store');
    expect(html).toContain('Receipt sent with');
  });
});
