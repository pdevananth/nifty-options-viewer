import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export class DbService {
  private db: Database.Database;
  
  constructor(dbPath?: string) {
    // Create db directory if it doesn't exist
    const dbDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    const dbFilePath = dbPath || path.join(dbDir, 'options.db');
    this.db = new Database(dbFilePath);
    
    // Enable foreign keys and WAL mode for better performance
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    
    this.initTables();
  }
  
  private initTables(): void {
    // Create tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS options (
        token TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        strike REAL NOT NULL,
        optType TEXT NOT NULL,
        expiry TEXT NOT NULL,
        lotSize INTEGER NOT NULL,
        tickSize REAL NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_options_expiry ON options(expiry);
      CREATE INDEX IF NOT EXISTS idx_options_strike ON options(strike);
      CREATE INDEX IF NOT EXISTS idx_options_optType ON options(optType);
    `);
  }
  
  saveOptions(options: any[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO options (token, symbol, strike, optType, expiry, lotSize, tickSize)
      VALUES (@token, @symbol, @strike, @optType, @expiry, @lotSize, @tickSize)
    `);
    
    const transaction = this.db.transaction((options) => {
      for (const option of options) {
        stmt.run(option);
      }
    });
    
    transaction(options);
  }
  
  getOptionsByExpiry(expiry: string): any[] {
    return this.db.prepare('SELECT * FROM options WHERE expiry = ?').all(expiry);
  }
  
  getOptionsInStrikeRange(min: number, max: number): any[] {
    return this.db.prepare('SELECT * FROM options WHERE strike BETWEEN ? AND ?').all(min, max);
  }
  
  getAllExpiries(): string[] {
    // Cast the result to string[] since we know the expiry column contains strings
    return this.db.prepare('SELECT DISTINCT expiry FROM options ORDER BY expiry')
      .pluck()
      .all() as string[];
  }
  
  getOptionByToken(token: string): any {
    return this.db.prepare('SELECT * FROM options WHERE token = ?').get(token);
  }
  
  close(): void {
    this.db.close();
  }
}

// Create a singleton instance
export const dbService = new DbService();