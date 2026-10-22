const { sequelize, initAppData } = require('../models');

async function syncDatabase() {
  const env = String(process.env.NODE_ENV || '').toLowerCase();
  if (env === 'production') {
    console.error('Refusing to run sync in production. Use migrations instead.');
    process.exit(1);
  }

  // A developer .env may hold the hosted (production) DATABASE_URL. Only
  // alter a remote database when explicitly asked to.
  const host = sequelize.config.host || '';
  const isLocal = ['localhost', '127.0.0.1', '::1', ''].includes(host);
  if (!isLocal && process.env.ALLOW_REMOTE_SYNC !== 'true') {
    console.error(`Refusing to alter remote database at ${host}. Set ALLOW_REMOTE_SYNC=true if this is intended.`);
    process.exit(1);
  }

  try {
    await sequelize.sync({ alter: { drop: false } });
    await initAppData();
    console.log('Database synchronized successfully.');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

syncDatabase();
