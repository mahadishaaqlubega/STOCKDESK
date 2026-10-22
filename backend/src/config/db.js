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
const useSsl =
  ['true', 'require', '1'].includes(String(process.env.DATABASE_SSL || '').toLowerCase()) ||
  Boolean(connectionString);

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

const sequelize = connectionString
  ? new Sequelize(connectionString, {
      dialect: 'postgres',
      logging: false,
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
