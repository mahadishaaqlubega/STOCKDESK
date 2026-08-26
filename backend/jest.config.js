module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/db.js',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
};
