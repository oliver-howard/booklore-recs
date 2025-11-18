import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TBRBook, UserReading, DataSourcePreference } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'booklore.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    booklore_username TEXT,
    booklore_password TEXT,
    goodreads_readings TEXT,
    data_source_preference TEXT NOT NULL DEFAULT 'auto',
    is_admin INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tbr_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    reasoning TEXT,
    amazon_url TEXT,
    added_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tbr_user_id ON tbr_books(user_id);
`);

const alterColumns = [
  `ALTER TABLE users ADD COLUMN data_source_preference TEXT NOT NULL DEFAULT 'auto'`,
  `ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN reader_profile TEXT`,
  `ALTER TABLE users ADD COLUMN reader_profile_last_update TEXT`,
  `ALTER TABLE users ADD COLUMN reader_profile_readings_count INTEGER`,
];

for (const statement of alterColumns) {
  try {
    db.exec(statement);
  } catch (error: any) {
    if (!String(error?.message).includes('duplicate column name')) {
      throw error;
    }
  }
}

export interface User {
  id: number;
  username: string;
  createdAt: string;
  bookloreUsername?: string;
  booklorePassword?: string;
  goodreadsReadings?: UserReading[];
  dataSourcePreference: DataSourcePreference;
  isAdmin: boolean;
  readerProfile?: string;
  readerProfileLastUpdate?: string;
  readerProfileReadingsCount?: number;
}

export class DatabaseService {
  /**
   * Create a new user account
   */
  static async createUser(username: string, password: string): Promise<User> {
    // Validate username
    if (!username || username.length < 3) {
      throw new Error('Username must be at least 3 characters long');
    }

    // Validate password
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const countRow = db.prepare(`SELECT COUNT(*) as count FROM users`).get() as any;
      const isFirstUser = countRow.count === 0;
      const stmt = db.prepare(`
        INSERT INTO users (username, password_hash, data_source_preference, is_admin)
        VALUES (?, ?, 'auto', ?)
      `);

      const result = stmt.run(username, passwordHash, isFirstUser ? 1 : 0);

      return {
        id: result.lastInsertRowid as number,
        username,
        createdAt: new Date().toISOString(),
        dataSourcePreference: 'auto',
        isAdmin: isFirstUser,
      };
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT') {
        throw new Error('Username already exists');
      }
      throw error;
    }
  }

  /**
   * Authenticate a user
   */
  static async authenticateUser(username: string, password: string): Promise<User> {
    const stmt = db.prepare(`
      SELECT id, username, password_hash, created_at,
             booklore_username, booklore_password, goodreads_readings,
             data_source_preference, is_admin
      FROM users
      WHERE username = ?
    `);

    const row = stmt.get(username) as any;

    if (!row) {
      throw new Error('Invalid username or password');
    }

    const isValid = await bcrypt.compare(password, row.password_hash);

    if (!isValid) {
      throw new Error('Invalid username or password');
    }

    return {
      id: row.id,
      username: row.username,
      createdAt: row.created_at,
      bookloreUsername: row.booklore_username || undefined,
      booklorePassword: row.booklore_password || undefined,
      goodreadsReadings: row.goodreads_readings ? JSON.parse(row.goodreads_readings) : undefined,
      dataSourcePreference: row.data_source_preference || 'auto',
      isAdmin: !!row.is_admin,
    };
  }

  /**
   * Get user by ID
   */
  static getUserById(userId: number): User | null {
    const stmt = db.prepare(`
      SELECT id, username, created_at,
             booklore_username, booklore_password, goodreads_readings,
             data_source_preference, is_admin
      FROM users
      WHERE id = ?
    `);

    const row = stmt.get(userId) as any;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      username: row.username,
      createdAt: row.created_at,
      bookloreUsername: row.booklore_username || undefined,
      booklorePassword: row.booklore_password || undefined,
      goodreadsReadings: row.goodreads_readings ? JSON.parse(row.goodreads_readings) : undefined,
      dataSourcePreference: row.data_source_preference || 'auto',
      isAdmin: !!row.is_admin,
    };
  }

  /**
   * Update user's BookLore credentials
   */
  static updateBookLoreCredentials(userId: number, username: string, password: string): void {
    const stmt = db.prepare(`
      UPDATE users
      SET booklore_username = ?, booklore_password = ?
      WHERE id = ?
    `);

    stmt.run(username, password, userId);
  }

  /**
   * Clear user's BookLore credentials
   */
  static clearBookLoreCredentials(userId: number): void {
    const stmt = db.prepare(`
      UPDATE users
      SET booklore_username = NULL, booklore_password = NULL
      WHERE id = ?
    `);

    stmt.run(userId);
  }

  /**
   * Update user's Goodreads readings from CSV
   */
  static updateGoodreadsReadings(userId: number, readings: UserReading[]): void {
    const stmt = db.prepare(`
      UPDATE users
      SET goodreads_readings = ?
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(readings), userId);
  }

  /**
   * Clear user's Goodreads readings
   */
  static clearGoodreadsReadings(userId: number): void {
    const stmt = db.prepare(`
      UPDATE users
      SET goodreads_readings = NULL
      WHERE id = ?
    `);

    stmt.run(userId);
  }

  /**
   * Add book to user's TBR list
   */
  static addToTBR(userId: number, book: Omit<TBRBook, 'addedAt'>): TBRBook {
    const addedAt = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO tbr_books (user_id, book_id, title, author, reasoning, amazon_url, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      userId,
      book.id,
      book.title,
      book.author,
      book.reasoning || null,
      book.amazonUrl || null,
      addedAt
    );

    return {
      ...book,
      addedAt,
    };
  }

  /**
   * Get user's TBR list
   */
  static getTBRList(userId: number): TBRBook[] {
    const stmt = db.prepare(`
      SELECT book_id, title, author, reasoning, amazon_url, added_at
      FROM tbr_books
      WHERE user_id = ?
      ORDER BY added_at DESC
    `);

    const rows = stmt.all(userId) as any[];

    return rows.map(row => ({
      id: row.book_id,
      title: row.title,
      author: row.author,
      reasoning: row.reasoning || undefined,
      amazonUrl: row.amazon_url || undefined,
      addedAt: row.added_at,
    }));
  }

  /**
   * Remove book from user's TBR list
   */
  static removeFromTBR(userId: number, bookId: string): void {
    const stmt = db.prepare(`
      DELETE FROM tbr_books
      WHERE user_id = ? AND book_id = ?
    `);

    stmt.run(userId, bookId);
  }

  /**
   * Clear user's entire TBR list
   */
  static clearTBR(userId: number): void {
    const stmt = db.prepare(`
      DELETE FROM tbr_books
      WHERE user_id = ?
    `);

    stmt.run(userId);
  }

  static updateDataSourcePreference(userId: number, preference: DataSourcePreference): void {
    const stmt = db.prepare(`
      UPDATE users
      SET data_source_preference = ?
      WHERE id = ?
    `);

    stmt.run(preference, userId);
  }

  static getAllUsers(): Array<{
    id: number;
    username: string;
    createdAt: string;
    isAdmin: boolean;
    hasBookLore: boolean;
    hasGoodreads: boolean;
  }> {
    const stmt = db.prepare(`
      SELECT id, username, created_at, is_admin,
             booklore_username, booklore_password, goodreads_readings
      FROM users
      ORDER BY created_at ASC
    `);

    const rows = stmt.all() as any[];

    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      createdAt: row.created_at,
      isAdmin: !!row.is_admin,
      hasBookLore: !!(row.booklore_username && row.booklore_password),
      hasGoodreads: (() => {
        if (!row.goodreads_readings) {
          return false;
        }
        try {
          return JSON.parse(row.goodreads_readings).length > 0;
        } catch {
          return false;
        }
      })(),
    }));
  }

  static deleteUser(userId: number): void {
    const stmt = db.prepare(`DELETE FROM users WHERE id = ?`);
    stmt.run(userId);
  }

  static async updateUserPassword(userId: number, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const stmt = db.prepare(`
      UPDATE users
      SET password_hash = ?
      WHERE id = ?
    `);

    stmt.run(passwordHash, userId);
  }

  static updateAdminStatus(userId: number, isAdmin: boolean): void {
    const stmt = db.prepare(`
      UPDATE users
      SET is_admin = ?
      WHERE id = ?
    `);

    stmt.run(isAdmin ? 1 : 0, userId);
  }

  static updateReaderProfile(userId: number, profile: string, readingsCount: number): void {
    const stmt = db.prepare(`
      UPDATE users
      SET reader_profile = ?, reader_profile_last_update = ?, reader_profile_readings_count = ?
      WHERE id = ?
    `);

    stmt.run(profile, new Date().toISOString(), readingsCount, userId);
  }

  static getReaderProfile(userId: number): { profile: string | null; lastUpdate: string | null; readingsCount: number | null } {
    const stmt = db.prepare(`
      SELECT reader_profile, reader_profile_last_update, reader_profile_readings_count
      FROM users
      WHERE id = ?
    `);

    const row = stmt.get(userId) as any;
    if (!row) return { profile: null, lastUpdate: null, readingsCount: null };

    return {
      profile: row.reader_profile,
      lastUpdate: row.reader_profile_last_update,
      readingsCount: row.reader_profile_readings_count,
    };
  }
}
