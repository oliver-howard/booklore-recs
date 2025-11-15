import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TBRBook {
  id: string; // unique ID for the book (generated from title + author)
  title: string;
  author: string;
  reasoning?: string; // Why this was recommended
  amazonUrl?: string;
  addedAt: string; // ISO timestamp
}

export class UserDataService {
  private dataDir: string;

  constructor() {
    // Store data in project root/data directory
    this.dataDir = path.join(__dirname, '../data/users');
  }

  /**
   * Get the directory path for a specific user
   */
  private getUserDir(username: string): string {
    // Sanitize username to prevent directory traversal attacks
    const sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, sanitizedUsername);
  }

  /**
   * Get the TBR file path for a user
   */
  private getTBRFilePath(username: string): string {
    return path.join(this.getUserDir(username), 'tbr.json');
  }

  /**
   * Ensure user directory exists
   */
  private async ensureUserDir(username: string): Promise<void> {
    const userDir = this.getUserDir(username);
    try {
      await fs.mkdir(userDir, { recursive: true });
    } catch (error) {
      console.error(`Error creating user directory for ${username}:`, error);
      throw new Error('Failed to create user data directory');
    }
  }

  /**
   * Get user's TBR list
   */
  async getTBR(username: string): Promise<TBRBook[]> {
    const filePath = this.getTBRFilePath(username);

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error: any) {
      // If file doesn't exist, return empty array
      if (error.code === 'ENOENT') {
        return [];
      }
      console.error(`Error reading TBR for ${username}:`, error);
      throw new Error('Failed to read TBR list');
    }
  }

  /**
   * Save user's TBR list
   */
  private async saveTBR(username: string, tbr: TBRBook[]): Promise<void> {
    await this.ensureUserDir(username);
    const filePath = this.getTBRFilePath(username);

    try {
      await fs.writeFile(filePath, JSON.stringify(tbr, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Error saving TBR for ${username}:`, error);
      throw new Error('Failed to save TBR list');
    }
  }

  /**
   * Add a book to user's TBR list
   */
  async addToTBR(username: string, book: Omit<TBRBook, 'addedAt'>): Promise<TBRBook> {
    const tbr = await this.getTBR(username);

    // Check if book already exists
    const exists = tbr.some((b) => b.id === book.id);
    if (exists) {
      throw new Error('Book already in TBR list');
    }

    // Add timestamp
    const tbrBook: TBRBook = {
      ...book,
      addedAt: new Date().toISOString(),
    };

    tbr.push(tbrBook);
    await this.saveTBR(username, tbr);

    return tbrBook;
  }

  /**
   * Remove a book from user's TBR list
   */
  async removeFromTBR(username: string, bookId: string): Promise<void> {
    const tbr = await this.getTBR(username);
    const filtered = tbr.filter((b) => b.id !== bookId);

    if (filtered.length === tbr.length) {
      throw new Error('Book not found in TBR list');
    }

    await this.saveTBR(username, filtered);
  }

  /**
   * Clear user's entire TBR list
   */
  async clearTBR(username: string): Promise<void> {
    await this.saveTBR(username, []);
  }

  /**
   * Check if a book is in user's TBR list
   */
  async isInTBR(username: string, bookId: string): Promise<boolean> {
    const tbr = await this.getTBR(username);
    return tbr.some((b) => b.id === bookId);
  }

  /**
   * Generate a unique ID for a book (based on title and author)
   */
  static generateBookId(title: string, author: string): string {
    const normalized = `${title.toLowerCase()}-${author.toLowerCase()}`
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return normalized;
  }
}
