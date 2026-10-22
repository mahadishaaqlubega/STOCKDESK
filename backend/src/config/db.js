const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRESQL_URL ||
  process.env.RAILWAY_DATABASE_URL;

const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const hasDiscreteDbConfig = Boolean(
  process.env.DATABASE_NAME ||
  process.env.PGDATABASE ||
  process.env.DATABASE_USER ||
  process.env.PGUSER ||
  process.env.DATABASE_HOST ||
  process.env.PGHOST
);

if (isProduction && !connectionString && !hasDiscreteDbConfig) {
  throw new Error(
    'No database configuration found. On Railway, link a PostgreSQL service or set DATABASE_URL before starting the backend.'
  );
}

const databaseName = process.env.DATABASE_NAME || process.env.PGDATABASE;
const databaseUser = process.env.DATABASE_USER || process.env.PGUSER;
const databasePassword = process.env.DATABASE_PASSWORD || process.env.PGPASSWORD;
const databaseHost = process.env.DATABASE_HOST || process.env.PGHOST || 'localhost';
const databasePort = process.env.DATABASE_PORT || process.env.PGPORT || 5432;
// DATABASE_SSL=true/false wins when set; otherwise connection strings (hosted
// databases) use TLS and discrete local settings do not.
const sslSetting = String(process.env.DATABASE_SSL || '').toLowerCase();
const useSsl = ['true', 'require', '1'].includes(sslSetting)
  ? true
  : ['false', 'disable', '0'].includes(sslSetting)
    ? false
    : Boolean(connectionString);

// Safety net for local development: scripts/dev-local.ps1 sets
// STOCKDESK_LOCAL_ONLY=1, and then we refuse to connect anywhere but this
// machine, so a stray DATABASE_URL (e.g. production, from .env) can never be used.
if (process.env.STOCKDESK_LOCAL_ONLY === '1') {
  const targetHost = databaseHostForGuard();
  if (!['localhost', '127.0.0.1', '::1'].includes(targetHost)) {
    throw new Error(`STOCKDESK_LOCAL_ONLY is set but the database host is "${targetHost}". Refusing to start.`);
  }
}

function databaseHostForGuard() {
  if (connectionString) {
    try {
      return new URL(connectionString).hostname;
    } catch {
      return 'unparseable-connection-string';
    }
  }
  return process.env.DATABASE_HOST || process.env.PGHOST || 'localhost';
}

// Certificate validation for Postgres over TLS. Managed providers (e.g.
// Railway) present cert chains that Node does not trust by default, so we
// accept self-signed/intermediate certs unless the operator explicitly opts
// into strict validation via DB_SSL_REJECT_UNAUTHORIZED=true.
const sslRejectUnauthorized =
  String(process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() === 'true';

if (!sslRejectUnauthorized && useSsl) {
  console.log(
    'Database config: TLS certificate validation is relaxed (DB_SSL_REJECT_UNAUTHORIZED not set to true).'
  );
}

// Sequelize's default pool (5) queues requests once a few shops are busy at
// the same time. Railway Postgres allows ~100 connections.
const pool = {
  max: Number(process.env.DB_POOL_MAX || 15),
  min: 0,
  idle: 10000,
  acquire: 30000,
};

const { APP_TIMEZONE } = require('./timezone');

const sequelize = connectionString
  ? new Sequelize(connectionString, {
      dialect: 'postgres',
      logging: false,
      pool,
      // Session time zone: SQL that groups by day uses local days.
      timezone: APP_TIMEZONE,
      dialectOptions: useSsl
        ? {
            ssl: {
              require: true,
              rejectUnauthorized: sslRejectUnauthorized,
            },
          }
        : {},
    })
  : new Sequelize(
      databaseName,
      databaseUser,
      databasePassword,
      {
        host: databaseHost,
        port: databasePort,
        dialect: 'postgres',
        logging: false,
        pool,
        timezone: APP_TIMEZONE,
        dialectOptions: useSsl
          ? {
              ssl: {
                require: true,
                rejectUnauthorized: sslRejectUnauthorized,
              },
            }
          : {},
      }
    );

  if (connectionString) {
    console.log('Database config: using connection string environment variable.');
  } else {
    console.log(`Database config: using host ${databaseHost}:${databasePort} and database ${databaseName || '(unset)'}.`);
  }

module.exports = sequelize;
