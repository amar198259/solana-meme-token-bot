const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, '../bot.db');
    this.db = null;
  }

  /**
   * تهيئة قاعدة البيانات
   */
  initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('✅ تم الاتصال بقاعدة البيانات');
        this.createTables();
        resolve();
      });
    });
  }

  /**
   * إنشاء الجداول
   */
  createTables() {
    const tables = [
      // جدول المستخدمين
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        telegramId INTEGER UNIQUE,
        walletAddress TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // جدول المعاملات
      `CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        type TEXT,
        tokenAddress TEXT,
        amount REAL,
        cost REAL,
        proceeds REAL,
        txHash TEXT UNIQUE,
        status TEXT DEFAULT 'pending',
        timestamp DATETIME,
        FOREIGN KEY(userId) REFERENCES users(id)
      )`,

      // جدول المحفظة
      `CREATE TABLE IF NOT EXISTS portfolio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        tokenAddress TEXT,
        symbol TEXT,
        amount REAL,
        buyPrice REAL,
        currentPrice REAL,
        purchaseDate DATETIME,
        FOREIGN KEY(userId) REFERENCES users(id),
        UNIQUE(userId, tokenAddress)
      )`,

      // جدول المراقبة التلقائية (جديد)
      `CREATE TABLE IF NOT EXISTS autoTrade (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        tokenAddress TEXT,
        entryPrice REAL,
        targetPrice REAL,
        amount REAL,
        profitPercent INTEGER DEFAULT 200,
        status TEXT DEFAULT 'waiting_to_buy',
        buyTxHash TEXT,
        sellTxHash TEXT,
        finalPrice REAL,
        createdAt DATETIME,
        boughtAt DATETIME,
        soldAt DATETIME,
        FOREIGN KEY(userId) REFERENCES users(id)
      )`,

      // جدول السعر التاريخي
      `CREATE TABLE IF NOT EXISTS priceHistory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tokenAddress TEXT,
        price REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    tables.forEach((table) => {
      this.db.run(table, (err) => {
        if (err) {
          console.error('❌ خطأ في إنشاء الجدول:', err);
        }
      });
    });
  }

  /**
   * إضافة مستخدم
   */
  addUser(telegramId, walletAddress) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR IGNORE INTO users (telegramId, walletAddress) VALUES (?, ?)',
        [telegramId, walletAddress],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  /**
   * إضافة معاملة
   */
  addTransaction(telegramId, transaction) {
    return new Promise((resolve, reject) => {
      const { type, tokenAddress, amount, cost, proceeds, txHash, timestamp } = transaction;
      
      this.db.run(
        `INSERT INTO transactions 
         (userId, type, tokenAddress, amount, cost, proceeds, txHash, timestamp)
         SELECT id, ?, ?, ?, ?, ?, ?, ? FROM users WHERE telegramId = ?`,
        [type, tokenAddress, amount, cost || null, proceeds || null, txHash, timestamp, telegramId],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  /**
   * إضافة مراقبة تلقائية جديدة
   */
  addAutoTradeWatch(telegramId, watch) {
    return new Promise((resolve, reject) => {
      const { tokenAddress, entryPrice, targetPrice, amount, profitPercent, status, createdAt } = watch;
      
      this.db.run(
        `INSERT INTO autoTrade 
         (userId, tokenAddress, entryPrice, targetPrice, amount, profitPercent, status, createdAt)
         SELECT id, ?, ?, ?, ?, ?, ?, ? FROM users WHERE telegramId = ?`,
        [tokenAddress, entryPrice, targetPrice, amount, profitPercent, status, createdAt, telegramId],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  /**
   * تحديث حالة المراقبة التلقائية
   */
  updateAutoTradeStatus(telegramId, tokenAddress, updates) {
    return new Promise((resolve, reject) => {
      const { amount, buyTxHash, status, boughtAt, soldAt, sellTxHash, finalPrice } = updates;
      
      this.db.run(
        `UPDATE autoTrade 
         SET amount = ?, buyTxHash = ?, status = ?, boughtAt = ?, soldAt = ?, sellTxHash = ?, finalPrice = ?
         WHERE userId = (SELECT id FROM users WHERE telegramId = ?) AND tokenAddress = ?`,
        [amount || null, buyTxHash || null, status, boughtAt || null, soldAt || null, sellTxHash || null, finalPrice || null, telegramId, tokenAddress],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * الحصول على قائمة المراقبة للمستخدم
   */
  getUserWatchlist(telegramId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT a.* FROM autoTrade a
         JOIN users u ON a.userId = u.id
         WHERE u.telegramId = ? AND a.status = 'monitoring'`,
        [telegramId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * الحصول على محفظة المستخدم
   */
  getUserPortfolio(telegramId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT p.* FROM portfolio p
         JOIN users u ON p.userId = u.id
         WHERE u.telegramId = ?`,
        [telegramId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * تحديث رصيد المحفظة
   */
  updatePortfolio(telegramId, tokenAddress, amount, buyPrice, symbol = 'MEME') {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO portfolio (userId, tokenAddress, symbol, amount, buyPrice, currentPrice, purchaseDate)
         SELECT id, ?, ?, ?, ?, ?, datetime('now')
         FROM users WHERE telegramId = ?
         ON CONFLICT(userId, tokenAddress) DO UPDATE SET
         amount = amount + ?,
         currentPrice = ?`,
        [tokenAddress, symbol, amount, buyPrice, buyPrice, telegramId, amount, buyPrice],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * الحصول على المعاملات
   */
  getUserTransactions(telegramId, limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT t.* FROM transactions t
         JOIN users u ON t.userId = u.id
         WHERE u.telegramId = ?
         ORDER BY t.timestamp DESC
         LIMIT ?`,
        [telegramId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * حساب الربح/الخسارة
   */
  getProfitLoss(telegramId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT 
         COALESCE(SUM(CASE WHEN type='BUY' THEN cost ELSE 0 END), 0) as totalBuy,
         COALESCE(SUM(CASE WHEN type='SELL' THEN proceeds ELSE 0 END), 0) as totalSell
         FROM transactions t
         JOIN users u ON t.userId = u.id
         WHERE u.telegramId = ?`,
        [telegramId],
        (err, row) => {
          if (err) reject(err);
          else {
            const profitLoss = (row.totalSell - row.totalBuy) || 0;
            resolve({
              totalBuy: row.totalBuy,
              totalSell: row.totalSell,
              profitLoss,
              profitLossPercent: row.totalBuy > 0 ? (profitLoss / row.totalBuy) * 100 : 0
            });
          }
        }
      );
    });
  }

  /**
   * إغلاق قاعدة البيانات
   */
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

module.exports = Database;
