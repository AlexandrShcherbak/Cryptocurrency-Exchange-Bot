const { pgTable, serial, text, timestamp, real, integer, jsonb, decimal } = require('drizzle-orm/pg-core');
const { relations } = require('drizzle-orm');

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  telegram_id: text('telegram_id').notNull().unique(),
  username: text('username'),
  first_name: text('first_name'),
  balance: decimal('balance', { precision: 15, scale: 2 }).default('0.00').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => users.id).notNull(),
  telegram_id: text('telegram_id').notNull(),
  type: text('type').notNull(), // 'deposit', 'purchase'
  amount: real('amount').notNull(),
  status: text('status').default('pending').notNull(), // 'pending', 'completed', 'failed'
  payment_method: text('payment_method'),
  payment_id: text('payment_id'),
  wallet_address: text('wallet_address'),
  metadata: text('metadata'), // JSON string with payment metadata
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

const reserve = pgTable('reserve', {
  id: serial('id').primaryKey(),
  trx_amount: real('trx_amount').default(0).notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

const rates = pgTable('rates', {
  id: serial('id').primaryKey(),
  currency_pair: text('currency_pair').notNull(),
  rate: real('rate').notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

const usersRelations = relations(users, ({ many }) => ({
  transactions: many(transactions),
}));

const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.user_id],
    references: [users.id],
  }),
}));

module.exports = {
  users,
  transactions,
  reserve,
  rates,
  usersRelations,
  transactionsRelations
};