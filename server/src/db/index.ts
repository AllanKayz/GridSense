import pg from 'pg';
const { Pool } = pg;

export const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'gridsense',
  password: process.env.DB_PASSWORD || 'gridsense_pass',
  database: process.env.DB_NAME || 'gridsense_db',
  max: 20,
  idleTimeoutMillis: 30000,
});
