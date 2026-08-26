jest.mock('../src/models', () => {
  const mockModel = () => ({
    findOne: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
    save: jest.fn(),
  });

  return {
    Shop: mockModel(),
    User: mockModel(),
    Setting: mockModel(),
    PendingSignup: mockModel(),
    Product: mockModel(),
    Customer: mockModel(),
    Sale: mockModel(),
    SaleItem: mockModel(),
    Expense: mockModel(),
    AuditLog: mockModel(),
    DayClosure: mockModel(),
    StockIn: mockModel(),
    StockReconciliation: mockModel(),
    SaleReturn: mockModel(),
    SaleReturnItem: mockModel(),
    Receipt: mockModel(),
    sequelize: {
      authenticate: jest.fn(),
      sync: jest.fn(),
      query: jest.fn(),
      transaction: jest.fn(() => ({
        commit: jest.fn(),
        rollback: jest.fn(),
        finished: false,
      })),
      define: jest.fn(),
      close: jest.fn(),
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
