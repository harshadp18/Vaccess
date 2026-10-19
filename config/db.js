const { Pool } = require('pg');
const path = require('path');

// Try loading .env from current directory, project root, and parent
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const poolConfig = {
    user: process.env.DB_USER || 'postgres.lqzxtyehavqwbzskxffa',
    host: process.env.DB_HOST || 'aws-0-ap-northeast-2.pooler.supabase.com',
    database: process.env.DB_NAME || 'postgres',
    password: process.env.DB_PASSWORD || 'VaccessDB2026Q7mP84',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
};

if (process.env.DB_SSL === 'true' || (poolConfig.host && (poolConfig.host.includes('supabase') || poolConfig.host.includes('amazonaws') || poolConfig.host.includes('pooler')))) {
    poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('connect', () => {
    console.log('Connected to the PostgreSQL database!');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client:', err.message);
});

module.exports = pool;