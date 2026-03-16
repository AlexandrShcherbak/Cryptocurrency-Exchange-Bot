const { Pool, neonConfig } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-serverless');
const { sql } = require('drizzle-orm');
const ws = require("ws");
const config = require('../config.json');

neonConfig.webSocketConstructor = ws;

function getDatabaseConfig() {
    if (config.database) {
        console.log('Database configuration loaded from config.json');
        return config.database;
    } else {
        console.log('Using environment variables for database configuration');
        return {
            host: process.env.PGHOST,
            port: process.env.PGPORT,
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE,
            ssl: true,
            url: process.env.DATABASE_URL
        };
    }
}

const dbConfig = getDatabaseConfig();
const connectionString = dbConfig.url || 
    `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}${dbConfig.ssl ? '?sslmode=require' : ''}`;

const pool = new Pool({ connectionString });
const db = drizzle(pool);

// Функция для проверки и создания таблиц
async function ensureTablesExist() {
    try {
        console.log('🔄 Создание структуры базы данных...');

        // Создание таблицы users
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id TEXT UNIQUE NOT NULL,
                username TEXT,
                first_name TEXT,
                balance REAL DEFAULT 0 NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
            )
        `);

        // Создание таблицы transactions
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) NOT NULL,
                telegram_id TEXT NOT NULL,
                type TEXT NOT NULL,
                amount REAL NOT NULL,
                status TEXT DEFAULT 'pending' NOT NULL,
                payment_method TEXT,
                payment_id TEXT,
                wallet_address TEXT,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
            )
        `);

        // Добавление колонки metadata если её нет (для совместимости со старыми данными)
        try {
            await db.execute(sql`
                ALTER TABLE transactions 
                ADD COLUMN IF NOT EXISTS metadata TEXT
            `);
        } catch (error) {
            // Игнорируем ошибку если колонка уже существует
            console.log('Колонка metadata уже существует или произошла другая ошибка');
        }

        // Создание таблицы reserve
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS reserve (
                id SERIAL PRIMARY KEY,
                trx_amount REAL DEFAULT 0 NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
            )
        `);

        // Создание таблицы rates с базовой структурой
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS rates (
                id SERIAL PRIMARY KEY,
                rate REAL NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
            )
        `);

        // Добавление колонки currency_pair если её нет (для совместимости со старыми данными)
        try {
            await db.execute(sql`
                ALTER TABLE rates 
                ADD COLUMN IF NOT EXISTS currency_pair TEXT NOT NULL DEFAULT 'TRX_RUB'
            `);
        } catch (error) {
            // Игнорируем ошибку если колонка уже существует
            console.log('Колонка currency_pair уже существует или произошла другая ошибка');
        }

        // Создание индексов ТОЛЬКО ПОСЛЕ создания всех таблиц со всеми колонками
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transactions_telegram_id ON transactions(telegram_id)`);
        
        // Создаем индекс для currency_pair только если колонка существует
        try {
            await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_rates_currency_pair ON rates(currency_pair)`);
        } catch (error) {
            console.log('Не удалось создать индекс для currency_pair:', error.message);
        }

        // Вставка начальных данных если таблицы пусты
        try {
            const reserveCheck = await db.execute(sql`SELECT COUNT(*) as count FROM reserve`);
            console.log('Reserve check result:', reserveCheck);
            if (reserveCheck && reserveCheck.length > 0 && (reserveCheck[0].count === 0 || reserveCheck[0].count === '0')) {
                await db.execute(sql`INSERT INTO reserve (trx_amount) VALUES (1000.00)`);
                console.log('📦 Добавлен начальный резерв: 1000 TRX');
            }
        } catch (error) {
            console.log('Ошибка при проверке/добавлении резерва:', error.message);
            // Попробуем просто добавить резерв без проверки
            try {
                await db.execute(sql`INSERT INTO reserve (trx_amount) VALUES (1000.00)`);
                console.log('📦 Добавлен начальный резерв: 1000 TRX');
            } catch (insertError) {
                console.log('Резерв уже существует или другая ошибка');
            }
        }

        try {
            const rateCheck = await db.execute(sql`
                SELECT COUNT(*) as count FROM rates WHERE currency_pair = 'TRX_RUB'
            `);
            console.log('Rate check result:', rateCheck);
            if (rateCheck && rateCheck.length > 0 && (rateCheck[0].count === 0 || rateCheck[0].count === '0')) {
                await db.execute(sql`
                    INSERT INTO rates (currency_pair, rate) VALUES ('TRX_RUB', 29.00)
                `);
                console.log('💰 Добавлен начальный курс TRX: 29.00 ₽');
            }
        } catch (error) {
            console.log('Ошибка при проверке/добавлении курса:', error.message);
            // Попробуем добавить курс без проверки currency_pair (для старых таблиц)
            try {
                await db.execute(sql`
                    INSERT INTO rates (rate) VALUES (29.00)
                `);
                console.log('💰 Добавлен начальный курс TRX: 29.00 ₽');
            } catch (insertError) {
                console.log('Курс уже существует или другая ошибка');
            }
        }

        console.log('✅ База данных готова к работе!');
    } catch (error) {
        console.error('❌ Ошибка инициализации базы данных:', error);
        throw error;
    }
}

module.exports = { db, getDatabaseConfig, ensureTablesExist };