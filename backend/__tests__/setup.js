// Point any accidental real connection at an unroutable local database.
// dotenv never overrides variables that are already set, so this wins over
// a developer's .env (which may point at production).
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/stockdesk_test_never_used';
process.env.NODE_ENV = 'test';

jest.mock('../src/models', () => {
  // Each model gets its own jest.fn instances so mocking User.findOne in a
  // test never leaks into Shop.findOne and vice versa.
  const mockModel = () => ({
    findOne: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn().mockResolvedValue([]),
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    bulkCreate: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
    save: jest.fn(),
  });

  const names = [
    'Shop', 'User', 'Setting', 'PendingSignup', 'Product', 'Customer', 'Sale', 'SaleItem',
    'Expense', 'Audit', 'DayClosure', 'StockIn', 'StockReconciliation', 'SaleReturn',
    'SaleReturnItem', 'Receipt', 'SubscriptionPayment', 'PaymentRequest', 'PlatformSetting', 'CustomerPrice', 'PlatformMessage',
  ];
  const models = Object.fromEntries(names.map((name) => [name, mockModel()]));

  return {
    ...models,
    sequelize: {
      authenticate: jest.fn(),
      sync: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(() => ({
        commit: jest.fn(),
        rollback: jest.fn(),
        finished: false,
        LOCK: { UPDATE: 'UPDATE' },
      })),
      define: jest.fn(),
      close: jest.fn(),
      fn: jest.fn(),
      col: jest.fn(),
      QueryTypes: { SELECT: 'SELECT' },
    },
    initAppData: jest.fn(),
  };
});

jest.mock('../src/services/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/utils/shop', () => ({
  generateUniqueShopSlug: jest.fn().mockResolvedValue('test-shop'),
}));

jest.mock('../src/utils/username', () => ({
  normalizeUsername: jest.fn((name) => name?.toLowerCase().trim() || ''),
}));

jest.mock('../src/utils/autoCloseBusinessDay', () => ({
  startAutoCloseScheduler: jest.fn(),
}));

process.env.JWT_SECRET = 'test-secret-key-for-testing';
process.env.JWT_EXPIRE = '1h';
process.env.EMAIL_PROVIDER = 'none';
