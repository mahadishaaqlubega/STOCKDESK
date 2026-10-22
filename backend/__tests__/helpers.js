const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

function adminToken(overrides = {}) {
  return signToken({ id: 1, role: 'Admin', shopId: 10, ...overrides });
}

function staffToken(overrides = {}) {
  return signToken({ id: 2, role: 'Staff', shopId: 10, ...overrides });
}

function superAdminToken(overrides = {}) {
  return signToken({ id: 99, role: 'SuperAdmin', shopId: null, ...overrides });
}

function unverifiedToken(overrides = {}) {
  return signToken({ id: 3, role: 'Admin', shopId: 11, ...overrides });
}

module.exports = { JWT_SECRET, signToken, adminToken, staffToken, superAdminToken, unverifiedToken };

// The auth middleware re-loads the user on every request. Make User.findByPk
// resolve to whoever the token says, so authenticated test requests succeed.
function mockAuthUsers() {
  const { User } = require('../src/models');
  const users = {
    1: { id: 1, role: 'Admin', name: 'Admin', username: 'admin', shopId: 10 },
    2: { id: 2, role: 'Staff', name: 'Staff', username: 'staff', shopId: 10 },
    3: { id: 3, role: 'Admin', name: 'Unverified', username: 'unverified', shopId: 11 },
    99: { id: 99, role: 'SuperAdmin', name: 'Owner', username: 'owner', shopId: null },
  };
  User.findByPk.mockImplementation(async (id) => users[id] || null);
}

module.exports.mockAuthUsers = mockAuthUsers;
