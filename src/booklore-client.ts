import { Book, UserReading, UserProfile } from './types.js';
import { config } from './config.js';

export class BookLoreClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private authToken?: string;
  private debug: boolean;

  constructor(username?: string, password?: string) {
    this.baseUrl = config.booklore.apiUrl;
    this.username = username || config.booklore.username;
    this.password = password || config.booklore.password;
    this.debug = process.env.DEBUG === 'true';
  }

  private log(...args: any[]) {
    if (this.debug) {
      console.log('[DEBUG]', ...args);
    }
  }

  /**
   * Authenticate with BookLore API
   * Note: The actual authentication endpoint may differ - this is a common pattern
   */
  async authenticate(): Promise<void> {
    try {
      this.log(`Attempting authentication to: ${this.baseUrl}/auth/login`);
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
      });

      this.log(`Auth response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorBody = await response.text();
        this.log(`Auth error body: ${errorBody}`);
        throw new Error(`Authentication failed: ${response.statusText}`);
      }

      const data = await response.json() as any;
      this.authToken = data.token || data.access_token || data.accessToken || data.jwt;
      this.log(`Auth token received: ${this.authToken ? 'Yes' : 'No'}`);
    } catch (error) {
      throw new Error(`Failed to authenticate with BookLore API: ${error}`);
    }
  }

  /**
   * Get authenticated headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Fetch user profile
   */
  async getUserProfile(): Promise<UserProfile> {
    try {
      const response = await fetch(`${this.baseUrl}/user/profile`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user profile: ${response.statusText}`);
      }

      return await response.json() as UserProfile;
    } catch (error) {
      throw new Error(`Failed to fetch user profile: ${error}`);
    }
  }

  /**
   * Fetch notes for a specific book
   */
  private async getBookNotes(bookId: number): Promise<string | undefined> {
    try {
      const response = await fetch(`${this.baseUrl}/book-notes/book/${bookId}`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        this.log(`No notes found for book ${bookId}`);
        return undefined;
      }

      const notes = await response.json() as any[];

      // Combine all notes for this book
      if (Array.isArray(notes) && notes.length > 0) {
        return notes.map(note => `${note.title}: ${note.content}`).join('\n\n');
      }

      return undefined;
    } catch (error) {
      this.log(`Error fetching notes for book ${bookId}:`, error);
      return undefined;
    }
  }

  /**
   * Fetch user's reading history with ratings and notes
   */
  async getUserReadingHistory(limit = 100): Promise<UserReading[]> {
    try {
      // BookLore uses /books endpoint that returns all books in library
      const url = `${this.baseUrl}/books`;
      this.log(`Fetching books from: ${url}`);

      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      this.log(`Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorBody = await response.text();
        this.log(`Error body: ${errorBody}`);
        throw new Error(`Failed to fetch books: ${response.statusText}`);
      }

      const data = await response.json() as any;
      this.log(`Retrieved ${data.length} books from library`);

      // The API returns an array of books directly, not UserReading objects
      // Transform the response to match our expected structure
      if (Array.isArray(data) && data.length > 0) {
        this.log(`Sample book structure:`, JSON.stringify(data[0]).substring(0, 200));

        const readBooks = data.filter((book: any) => book.readStatus === 'READ');
        this.log(`Found ${readBooks.length} read books, fetching notes in parallel...`);

        // Fetch notes for all read books in parallel with concurrency limit
        // to avoid overwhelming the API
        const CONCURRENCY_LIMIT = 5;
        const notesPromises: Promise<{ bookId: number; notes: string | undefined }>[] = [];
        
        for (let i = 0; i < readBooks.length; i += CONCURRENCY_LIMIT) {
          const batch = readBooks.slice(i, i + CONCURRENCY_LIMIT);
          const batchResults = await Promise.all(
            batch.map(async (book: any) => ({
              bookId: book.id,
              notes: await this.getBookNotes(book.id),
            }))
          );
          notesPromises.push(...batchResults.map(r => Promise.resolve(r)));
        }
        
        const notesResults = await Promise.all(notesPromises);
        const notesMap = new Map<number, string | undefined>();
        notesResults.forEach(({ bookId, notes }) => {
          notesMap.set(bookId, notes);
        });

        // Transform books into UserReading objects
        const readings: UserReading[] = readBooks.map((book: any) => {
          return {
            bookId: book.id,
            book: {
              id: book.id,
              title: book.metadata?.title || book.fileName?.replace(/\.[^.]+$/, '') || 'Unknown',
              author: book.metadata?.authors?.[0] || book.fileName?.split(' - ')[1]?.replace(/\.[^.]+$/, ''),
              description: book.metadata?.description || book.metadata?.subtitle,
              genres: book.metadata?.categories || book.metadata?.moods || [],
              isbn: book.metadata?.isbn13 || book.metadata?.isbn10,
              publishedDate: book.metadata?.publishedDate,
              coverImageUrl: book.metadata?.coverUrl || book.thumbnailUrl,
            },
            rating: book.metadata?.personalRating,
            status: 'read' as const,
            finishedAt: book.dateFinished,
            notes: notesMap.get(book.id),
            review: undefined, // BookLore doesn't have a separate review field
          };
        });

        return readings;
      }

      return data as UserReading[];
    } catch (error) {
      throw new Error(`Failed to fetch reading history: ${error}`);
    }
  }

  /**
   * Fetch books by genre
   */
  async getBooksByGenre(genre: string, limit = 20): Promise<Book[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/books?genre=${encodeURIComponent(genre)}&limit=${limit}`,
        {
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch books by genre: ${response.statusText}`);
      }

      return await response.json() as Book[];
    } catch (error) {
      throw new Error(`Failed to fetch books by genre: ${error}`);
    }
  }

  /**
   * Fetch books by author
   */
  async getBooksByAuthor(author: string, limit = 20): Promise<Book[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/books?author=${encodeURIComponent(author)}&limit=${limit}`,
        {
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch books by author: ${response.statusText}`);
      }

      return await response.json() as Book[];
    } catch (error) {
      throw new Error(`Failed to fetch books by author: ${error}`);
    }
  }

  /**
   * Search books
   */
  async searchBooks(query: string, limit = 20): Promise<Book[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/books/search?q=${encodeURIComponent(query)}&limit=${limit}`,
        {
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to search books: ${response.statusText}`);
      }

      return await response.json() as Book[];
    } catch (error) {
      throw new Error(`Failed to search books: ${error}`);
    }
  }

  /**
   * Get user's rated books (books with ratings)
   */
  async getUserRatedBooks(): Promise<UserReading[]> {
    const readings = await this.getUserReadingHistory();
    return readings.filter((reading) => reading.rating !== undefined && reading.rating > 0);
  }
}
