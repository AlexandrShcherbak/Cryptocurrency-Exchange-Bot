const { db } = require('./db.js');
const { users, transactions, reserve, rates } = require('../shared/schema.js');
const { eq, desc, sql, and } = require('drizzle-orm');
const { insert } = require('drizzle-orm/pg-core');

class DatabaseStorage {
  async init() {
    console.log('Database service initialized with PostgreSQL');
  }

  async getUser(telegramId) {
    try {
      const telegramIdStr = telegramId.toString();
      console.log(`🔍 Looking for user with telegram_id: ${telegramIdStr}`);
      
      const result = await db.select().from(users).where(eq(users.telegram_id, telegramIdStr));
      console.log(`📋 Query result:`, result);
      
      const user = result[0] || null;
      if (user) {
        console.log(`✅ User found: ID ${user.id}, balance: ${user.balance}`);
      } else {
        console.log(`❌ User not found with telegram_id: ${telegramIdStr}`);
      }
      
      return user;
    } catch (error) {
      console.error('Get user error:', error.message);
      console.error('Full error:', error);
      return null;
    }
  }

  async getUserById(id) {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user || null;
    } catch (error) {
      console.error('Get user by ID error:', error);
      return null;
    }
  }

  async createUser(insertUser) {
    try {
      const [user] = await db.insert(users).values(insertUser).returning();
      return user;
    } catch (error) {
      console.error('Create user error:', error);
      throw error;
    }
  }

  async updateUserBalance(telegramId, amount) {
    try {
      const user = await this.getUser(telegramId);
      if (!user) return null;

      const [updatedUser] = await db
        .update(users)
        .set({ 
          balance: (parseFloat(user.balance) + amount).toString(),
          updated_at: new Date()
        })
        .where(eq(users.telegram_id, telegramId.toString()))
        .returning();

      return updatedUser;
    } catch (error) {
      console.error('Update user balance error:', error);
      return null;
    }
  }

  async subtractBalance(telegramId, amount) {
    try {
      const user = await this.getUser(telegramId);
      if (!user) return null;

      const currentBalance = parseFloat(user.balance);
      if (currentBalance < amount) {
        throw new Error('Insufficient balance');
      }

      const [updatedUser] = await db
        .update(users)
        .set({ 
          balance: (currentBalance - amount).toString(),
          updated_at: new Date()
        })
        .where(eq(users.telegram_id, telegramId.toString()))
        .returning();

      return updatedUser;
    } catch (error) {
      console.error('Subtract balance error:', error);
      throw error;
    }
  }

  async addTransaction(userId, type, amount, metadata = {}) {
    try {
      const user = await this.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      console.log('📝 Adding transaction with metadata:', metadata);

      const enhancedMetadata = {
        ...metadata,
        payment_method: metadata.payment_method,
        invoice_id: metadata.invoice_id || metadata.payment_id,
        timestamp: new Date().toISOString()
      };

      console.log('📝 Enhanced metadata:', enhancedMetadata);

      const transactionData = {
        user_id: user.id,
        telegram_id: userId.toString(),
        type: type,
        amount: amount,
        status: 'pending',
        payment_method: metadata.payment_method || null,
        payment_id: metadata.invoice_id || metadata.payment_id || null,
        wallet_address: metadata.wallet_address || null,
        metadata: JSON.stringify(enhancedMetadata),
        created_at: new Date()
      };

      console.log('💾 Saving transaction data:', transactionData);

      const result = await db.insert(transactions).values(transactionData).returning();
      console.log('✅ Transaction saved:', result[0]);
      return result[0];
    } catch (error) {
      console.error('Add transaction error:', error.message);
      console.error('Full error:', error);
      throw error;
    }
  }

  async getTransaction(id) {
    try {
      const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id));
      return transaction || null;
    } catch (error) {
      console.error('Get transaction error:', error);
      return null;
    }
  }

  async updateTransactionStatus(id, status) {
    try {
      await db
        .update(transactions)
        .set({ status: status })
        .where(eq(transactions.id, id));
    } catch (error) {
      console.error('Update transaction status error:', error);
      throw error;
    }
  }

  async updateTransaction(id, updates) {
    try {
      await db
        .update(transactions)
        .set(updates)
        .where(eq(transactions.id, id));
    } catch (error) {
      console.error('Update transaction error:', error);
      throw error;
    }
  }

  async getUserTransactions(telegramId, limit = 10) {
    try {
      const userTransactions = await db
        .select()
        .from(transactions)
        .where(eq(transactions.telegram_id, telegramId.toString()))
        .orderBy(desc(transactions.created_at))
        .limit(limit);

      return userTransactions;
    } catch (error) {
      console.error('Get user transactions error:', error);
      return [];
    }
  }

  async getUserTransactionsByType(telegramId, type) {
    try {
      const userTransactions = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.telegram_id, telegramId.toString()),
            eq(transactions.type, type)
          )
        )
        .orderBy(desc(transactions.created_at));
      
      return userTransactions;
    } catch (error) {
      console.error('Get user transactions by type error:', error);
      return [];
    }
  }

  async getReserve() {
    try {
      const [reserveRecord] = await db.select().from(reserve).orderBy(desc(reserve.id)).limit(1);
      return reserveRecord ? parseFloat(reserveRecord.trx_amount) : 0;
    } catch (error) {
      console.error('Get reserve error:', error);
      return 0;
    }
  }

  async updateReserve(amount) {
    try {
      await db.insert(reserve).values({ 
        trx_amount: amount.toString(),
        updated_at: new Date()
      });
    } catch (error) {
      console.error('Update reserve error:', error);
      throw error;
    }
  }

  async subtractReserve(amount) {
    try {
      const currentReserve = await this.getReserve();
      if (currentReserve < amount) {
        return false;
      }

      const newAmount = currentReserve - amount;
      await this.updateReserve(newAmount);
      return true;
    } catch (error) {
      console.error('Subtract reserve error:', error);
      return false;
    }
  }

  async addReserve(amount) {
    try {
      const currentReserve = await this.getReserve();
      const newAmount = currentReserve + amount;
      await this.updateReserve(newAmount);
      return newAmount;
    } catch (error) {
      console.error('Add reserve error:', error);
      throw error;
    }
  }

  async updateRates(trxRate, usdRate) {
    try {
      // Update TRX rate
      await db
        .insert(rates)
        .values({
          currency_pair: 'TRX_RUB',
          rate: trxRate.toString(),
          updated_at: new Date()
        })
        .onConflictDoUpdate({
          target: rates.currency_pair,
          set: {
            rate: trxRate.toString(),
            updated_at: new Date()
          }
        });

      // Update USD rate if provided
      if (usdRate) {
        await db
          .insert(rates)
          .values({
            currency_pair: 'USD_RUB',
            rate: usdRate.toString(),
            updated_at: new Date()
          })
          .onConflictDoUpdate({
            target: rates.currency_pair,
            set: {
              rate: usdRate.toString(),
              updated_at: new Date()
            }
          });
      }
    } catch (error) {
      console.error('Update rates error:', error);
      throw error;
    }
  }

  async getCurrentRates() {
    try {
      const trxRate = await db
        .select()
        .from(rates)
        .where(eq(rates.currency_pair, 'TRX_RUB'))
        .orderBy(desc(rates.updated_at))
        .limit(1);

      const usdRate = await db
        .select()
        .from(rates)
        .where(eq(rates.currency_pair, 'USD_RUB'))
        .orderBy(desc(rates.updated_at))
        .limit(1);

      return {
        trx_rate: trxRate[0] ? parseFloat(trxRate[0].rate) : 0,
        usd_rate: usdRate[0] ? parseFloat(usdRate[0].rate) : 0
      };
    } catch (error) {
      console.error('Get current rates error:', error);
      return { trx_rate: 0, usd_rate: 0 };
    }
  }

  async getAllUsers() {
    try {
      const allUsers = await db.select().from(users);
      return allUsers;
    } catch (error) {
      console.error('Get all users error:', error);
      return [];
    }
  }

  async getUsersCount() {
    try {
      const result = await db.select({ count: sql`count(*)` }).from(users);
      return parseInt(result[0].count);
    } catch (error) {
      console.error('Get users count error:', error);
      return 0;
    }
  }
}

const storage = new DatabaseStorage();

module.exports = { storage };