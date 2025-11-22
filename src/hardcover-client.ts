import { UserReading, HardcoverBook } from './types.js';

class HardcoverGraphQLError extends Error {
  errors: any[];

  constructor(errors: any[]) {
    super('GraphQL errors: ' + JSON.stringify(errors));
    this.name = 'HardcoverGraphQLError';
    this.errors = errors;
  }
}

export interface HardcoverConfig {
  apiToken: string;
  apiUrl?: string;
}

export interface HardcoverUserBook {
  id: number;
  book_id: number;
  status_id: number; // 1=want, 2=currently reading, 3=finished
  rating?: number; // 1-5 scale
  edition_id?: number;
}

export interface HardcoverWantToReadEntry {
  id: number;
  title: string;
  author?: string;
}

/**
 * Hardcover GraphQL API Client
 *
 * Docs: https://docs.hardcover.app/api/getting-started/
 * Endpoint: https://api.hardcover.app/v1/graphql
 */
export class HardcoverClient {
  private apiUrl: string;
  private apiToken: string;
  private debugMode: boolean;
  private supportsFinishedAt: boolean | null;
  private static finishedAtCapability: boolean | null = null;
  private cachedUserId?: string | null;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private CACHE_TTL = 1000 * 60 * 60; // 1 hour

  constructor(config: HardcoverConfig) {
    this.apiUrl = config.apiUrl || 'https://api.hardcover.app/v1/graphql';
    this.apiToken = config.apiToken.trim().replace(/^Bearer\s+/i, ''); // Ensure no whitespace or existing Bearer prefix
    // Always enable debug for Hardcover client to help troubleshoot
    this.debugMode = true;
    this.supportsFinishedAt = HardcoverClient.finishedAtCapability; // unknown until first attempt

    // Log token info for debugging (not the actual token for security)
    this.log(`Token length: ${this.apiToken.length}`);
    this.log(`Token starts with: ${this.apiToken.substring(0, 10)}...`);
  }

  private log(message: string, ...args: any[]) {
    if (this.debugMode) {
      console.log(`[HardcoverClient] ${message}`, ...args);
    }
  }

  /**
   * Make GraphQL request to Hardcover API with retry logic
   */
  private async query<T>(query: string, variables?: Record<string, any>, retries = 3): Promise<T> {
    this.log('Making GraphQL request');
    this.log('Query:', query);
    this.log('Variables:', variables);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'authorization': `Bearer ${this.apiToken}`,
          },
          body: JSON.stringify({ query, variables }),
        });

        if (response.status === 429) {
          // Rate limited - wait longer before retrying
          const waitTime = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
          this.log(`Rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${retries}...`);

          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          } else {
            throw new Error('Rate limit exceeded after retries');
          }
        }

        if (!response.ok) {
          const error = await response.text();
          this.log('API Error:', error);
          throw new Error(`Hardcover API error: ${response.status} - ${error}`);
        }

        const result: any = await response.json();

        if (result.errors) {
          this.log('GraphQL Errors:', result.errors);

          // Check for authorization errors
          const authError = result.errors.find((e: any) =>
            e.message?.includes('Authorization') ||
            e.extensions?.code === 'invalid-headers'
          );

          if (authError) {
            throw new Error(
              'Hardcover API authorization failed. Please check that:\n' +
              '1. Your API token is valid and not expired (tokens expire after 1 year)\n' +
              '2. Get a fresh token from https://hardcover.app/account/api\n' +
              '3. Re-enter it in the Settings tab'
            );
          }

          throw new HardcoverGraphQLError(result.errors);
        }

        return result.data as T;
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        // Wait before next retry for non-429 errors too
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error('Query failed after all retries');
  }

  /**
   * Normalize string for comparison (remove punctuation, extra spaces, lowercase)
   */
  private normalizeForComparison(str: string): string {
    return str.toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Find the best match from a list of candidates using weighted scoring
   */
  private findBestMatch(
    candidates: HardcoverBook[],
    searchTitle: string,
    searchAuthor: string
  ): HardcoverBook | null {
    if (!candidates || candidates.length === 0) {
      return null;
    }

    const normalizedSearchTitle = this.normalizeForComparison(searchTitle);
    const normalizedSearchAuthor = this.normalizeForComparison(searchAuthor);

    const scoredCandidates = candidates.map((book) => {
      let score = 0;
      const bookTitle = this.normalizeForComparison(book.title);
      const bookAuthors =
        book.contributions?.map((c: any) => this.normalizeForComparison(c.author?.name || '')) || [];
      
      // Check for author match (fuzzy)
      const isAuthorMatch =
        !searchAuthor ||
        bookAuthors.some(
          (a: string) =>
            a.includes(normalizedSearchAuthor) ||
            normalizedSearchAuthor.includes(a)
        );

      // 1. Author Match (Critical)
      if (isAuthorMatch) {
        score += 1000;
      }

      // 2. Title Matching
      if (bookTitle === normalizedSearchTitle) {
        score += 100; // Exact match
      } else if (bookTitle.startsWith(normalizedSearchTitle)) {
        score += 75; // Starts with (e.g. "Deep Work: Rules...")
      } else if (bookTitle.includes(normalizedSearchTitle)) {
        score += 50; // Contains
      } else if (normalizedSearchTitle.includes(bookTitle)) {
        score += 50; // Reverse contains
      }

      // 3. Collection/Box Set Penalty
      // If the book title suggests a collection but the search title doesn't
      const collectionKeywords = ['collection', 'box set', 'bundle', 'series', 'complete set', ' 4 books', ' 3 books'];
      const isCollection = collectionKeywords.some(word => bookTitle.includes(word));
      const searchIsCollection = collectionKeywords.some(word => normalizedSearchTitle.includes(word));

      if (isCollection && !searchIsCollection) {
        score -= 50;
      }

      // 4. Popularity Bonus (Tie-breaker)
      // Logarithmic scale to prevent popularity from overwhelming title relevance
      if (book.users_count) {
        score += Math.log10(book.users_count + 1) * 5;
      }

      return { book, score };
    });

    // Sort by score descending
    scoredCandidates.sort((a, b) => b.score - a.score);

    if (this.debugMode) {
      this.log(
        'Scored matches:',
        scoredCandidates.slice(0, 3).map((c) => ({
          title: c.book.title,
          score: c.score,
          authorMatch: c.score >= 1000,
        }))
      );
    }

    return scoredCandidates[0].book;
  }

  /**
   * Search for a book by title and author
   */
  async searchBook(title: string, author: string): Promise<HardcoverBook | null> {
    const cacheKey = `search:${title.toLowerCase()}:${author.toLowerCase()}`;
    const cached = this.getFromCache<HardcoverBook>(cacheKey);
    if (cached) {
      this.log('Cache hit for search:', cacheKey);
      return cached;
    }

    this.log(`Searching for book: "${title}" by ${author}`);

    const query = `
      query SearchBooks($searchQuery: String!, $perPage: Int!) {
        search(
          query: $searchQuery
          query_type: "Book"
          per_page: $perPage
        ) {
          results
        }
      }
    `;

    try {
      // Strategy 1: Search with Title + Author
      let searchQuery = author ? `${title} ${author}` : title;
      let data = await this.query<{ search: { results: { hits: any[] } } }>(query, {
        searchQuery,
        perPage: 15,
      });

      let hits = data.search?.results?.hits || [];

      // Strategy 2: Fallback to Title only if no results
      if (hits.length === 0 && author) {
        this.log('No results for specific search, trying title only');
        searchQuery = title;
        data = await this.query<{ search: { results: { hits: any[] } } }>(query, {
          searchQuery,
          perPage: 15,
        });
        hits = data.search?.results?.hits || [];
      }

      if (hits.length === 0) {
        this.log('No books found');
        return null;
      }

      this.log(`Found ${hits.length} results`);

      // Extract book data from hits
      const books: HardcoverBook[] = hits.map((hit: any) => {
        const book = hit.document;
        return {
          id: parseInt(book.id), // ID comes as string, convert to number
          title: book.title,
          contributions: book.contributions || [],
          users_count: book.users_count,
          likes_count: book.likes_count,
        };
      });

      const bestMatch = this.findBestMatch(books, title, author);

      if (bestMatch) {
        this.log('Best match:', bestMatch.title);
        this.setCache(cacheKey, bestMatch);
        return bestMatch;
      }
      
      return null;
    } catch (error) {
      this.log('Search error:', error);
      return null;
    }
  }

  /**
   * Get detailed book information
   */
  async getBookDetails(title: string, author: string): Promise<HardcoverBook | null> {
    const cacheKey = `details:${title.toLowerCase()}:${author.toLowerCase()}`;
    const cached = this.getFromCache<HardcoverBook>(cacheKey);
    if (cached) {
      this.log('Cache hit for details:', cacheKey);
      return cached;
    }

    this.log(`Getting details for book: "${title}" by ${author}`);

    const query = `
      query BookDetails($searchQuery: String!) {
        search(
          query: $searchQuery
          query_type: "Book"
          per_page: 15
        ) {
          results
        }
      }
    `;

    try {
      // Strategy 1: Search with Title + Author
      let searchQuery = author ? `${title} ${author}` : title;
      let data = await this.query<{ search: { results: { hits: any[] } } }>(query, {
        searchQuery,
      });

      let hits = data.search?.results?.hits || [];

      // Strategy 2: Fallback to Title only if no results
      if (hits.length === 0 && author) {
        this.log('No results for specific search, trying title only');
        searchQuery = title;
        data = await this.query<{ search: { results: { hits: any[] } } }>(query, {
          searchQuery,
        });
        hits = data.search?.results?.hits || [];
      }

      if (hits.length === 0) {
        return null;
      }

      // Extract book data
      const books: HardcoverBook[] = hits.map((hit: any) => {
        const book = hit.document;
        return {
          id: parseInt(book.id),
          slug: book.slug,
          title: book.title,
          description: book.description,
          release_date: book.release_date,
          pages: book.pages,
          images: book.image ? [book.image] : (book.images || []),
          contributions: book.contributions || [],
          rating: book.rating,
          users_count: book.users_count,
          likes_count: book.likes_count,
        };
      });

      // Find best match
      const bestMatch = this.findBestMatch(books, title, author);

      if (bestMatch) {
        this.setCache(cacheKey, bestMatch);
        return bestMatch;
      }
      
      return null;
    } catch (error) {
      this.log('Get details error:', error);
      return null;
    }
  }

  /**
   * Add a book to user's library with status
   * Status IDs: 1 = Want to Read, 2 = Currently Reading, 3 = Finished
   */
  async addBookToLibrary(
    bookId: number,
    statusId: number,
    rating?: number,
    finishedAt?: string
  ): Promise<boolean> {
    this.log(
      `Adding book ${bookId} to library with status ${statusId}, rating: ${rating}, finishedAt: ${finishedAt}`
    );

    const includeFinishedAt = !!finishedAt && this.supportsFinishedAt !== false;
    const mutation = this.buildAddBookMutation(includeFinishedAt);

    try {
      const variables: Record<string, any> = {
        bookId,
        statusId,
        rating: rating ?? null,
      };

      if (includeFinishedAt) {
        variables.finishedAt = finishedAt ?? null;
      }

      const result = await this.query(mutation, variables);

      if (includeFinishedAt) {
        this.supportsFinishedAt = true;
        HardcoverClient.finishedAtCapability = true;
      }

      this.log('Successfully added book to library:', result);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const finishedAtUnsupported =
        includeFinishedAt &&
        (this.isFinishedAtUnsupported(errorMessage) || this.graphQLErrorsIncludeFinishedAt(error));

      if (finishedAtUnsupported) {
        // Hardcover may not allow finished_at for certain plans – disable and retry once
        this.supportsFinishedAt = false;
        HardcoverClient.finishedAtCapability = false;
        this.log('Finished date not supported by API. Retrying without finished_at field.');
        return this.addBookToLibrary(bookId, statusId, rating, undefined);
      }

      this.log('Error adding book:', error);
      // Don't throw - return false to allow continuing with other books
      return false;
    }
  }

  private graphQLErrorsIncludeFinishedAt(error: unknown): boolean {
    if (error instanceof HardcoverGraphQLError) {
      return error.errors?.some((err: any) =>
        typeof err?.message === 'string' && /finished[_A-Za-z]*at/i.test(err.message) ||
        typeof err?.extensions?.path === 'string' && /finished[_A-Za-z]*at/i.test(err.extensions.path || '')
      );
    }
    return false;
  }

  /**
   * Add a book to the user's Want to Read shelf on Hardcover
   */
  async addToWantToRead(
    title: string,
    author: string
  ): Promise<{ success: boolean; message?: string; hardcoverBookId?: number }> {
    if (!title) {
      return { success: false, message: 'Title is required to sync with Hardcover' };
    }

    this.log(`Syncing "${title}" by ${author} to Hardcover Want to Read shelf`);
    const match = await this.searchBook(title, author);

    if (!match) {
      return { success: false, message: 'Book not found on Hardcover' };
    }

    const added = await this.addBookToLibrary(match.id, 1);

    if (added) {
      return {
        success: true,
        hardcoverBookId: match.id,
      };
    }

    return {
      success: false,
      message: 'Failed to add book to Hardcover shelf',
    };
  }

  /**
   * Fetch user's Want to Read shelf from Hardcover
   */
  async getWantToReadList(limit = 200): Promise<HardcoverWantToReadEntry[]> {
    const cappedLimit = Math.min(Math.max(limit, 1), 200);
    const userId = this.getUserId();

    if (!userId) {
      this.log('Unable to extract user id from Hardcover token; skipping remote TBR pull');
      return [];
    }

    if (!this.isUuid(userId)) {
      this.log('Token user id is not a UUID; skipping Hardcover pull to avoid leaking other users');
      return [];
    }

    const query = `
      query WantToRead($userId: uuid!, $limit: Int!) {
        user_books(
          where: { status_id: { _eq: 1 }, user_id: { _eq: $userId } }
          order_by: { created_at: desc }
          limit: $limit
        ) {
          book_id
          book {
            id
            title
            contributions {
              author {
                name
              }
            }
          }
        }
      }
    `;

    const data = await this.query<{ user_books: any[] }>(query, {
      userId,
      limit: cappedLimit,
    });

    const entries: HardcoverWantToReadEntry[] = [];
    for (const item of data.user_books || []) {
      const book = item.book || {};
      const authors = (book.contributions || []).map((c: any) => c.author?.name).filter(Boolean);
      const numericId = Number(book.id ?? item.book_id);
      entries.push({
        id: Number.isNaN(numericId) ? item.book_id : numericId,
        title: book.title || 'Unknown Title',
        author: authors[0],
      });
    }

    return entries;
  }

  /**
   * Remove a book from the Hardcover Want to Read shelf
   */
  async removeFromWantToRead(bookId: number): Promise<boolean> {
    const userId = this.getUserId();

    if (!userId || !this.isUuid(userId)) {
      this.log('Cannot remove Hardcover entry because user id is unavailable');
      return false;
    }

    const mutation = `
      mutation RemoveFromWantToRead($bookId: Int!, $userId: uuid!) {
        delete_user_book(
          where: {
            book_id: { _eq: $bookId }
            user_id: { _eq: $userId }
            status_id: { _eq: 1 }
          }
        ) {
          affected_rows
        }
      }
    `;

    try {
      const result = await this.query<{ delete_user_book: { affected_rows: number } }>(
        mutation,
        { bookId, userId }
      );
      const rows = result.delete_user_book?.affected_rows ?? 0;
      if (rows === 0) {
        this.log(`No Hardcover Want to Read entries removed for book ${bookId}`);
      } else {
        this.log(`Removed ${rows} Hardcover Want to Read entries for book ${bookId}`);
      }
      return rows > 0;
    } catch (error) {
      this.log('Error removing book from Hardcover Want to Read shelf:', error);
      return false;
    }
  }

  /**
   * Extract Hardcover user ID from the API token (JWT)
   */
  private getUserId(): string | null {
    if (this.cachedUserId !== undefined) {
      return this.cachedUserId;
    }

    try {
      const parts = this.apiToken.split('.');
      if (parts.length < 2) {
        this.cachedUserId = null;
        return null;
      }
      const payload = parts[1];
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const decoded = Buffer.from(padded, 'base64').toString('utf-8');
      const claims = JSON.parse(decoded);
      const userId =
        claims?.sub ||
        claims?.user_id ||
        claims?.userId ||
        claims?.userUUID ||
        claims?.userUuid ||
        claims?.id;
      this.cachedUserId = typeof userId === 'string' ? userId : null;
      if (!this.cachedUserId) {
        this.log('JWT payload missing recognizable user identifier');
      }
      return this.cachedUserId;
    } catch (error) {
      this.log('Failed to decode Hardcover token for user id', error);
      this.cachedUserId = null;
      return null;
    }
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  /**
   * Build mutation for inserting a user book
   */
  private buildAddBookMutation(includeFinishedAt: boolean): string {
    const finishedAtVariable = includeFinishedAt ? ', $finishedAt: timestamptz' : '';
    const finishedAtField = includeFinishedAt ? '            finished_at: $finishedAt\n' : '';

    return `
      mutation AddBook($bookId: Int!, $statusId: Int!, $rating: numeric${finishedAtVariable}) {
        insert_user_book(
          object: {
            book_id: $bookId
            status_id: $statusId
            rating: $rating
${finishedAtField}          }
        ) {
          id
        }
      }
    `;
  }

  /**
   * Detect whether the API rejected finished_at usage
   */
  private isFinishedAtUnsupported(message: string): boolean {
    return /finished[_A-Za-z]*at/i.test(message);
  }

  private getFromCache<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data as T;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Fetch user's reading history (finished books)
   */
  async getUserReadingHistory(limit = 100): Promise<UserReading[]> {
    // Extract user ID from token
    const userId = this.getUserId();
    
    if (!userId) {
      this.log('Cannot fetch reading history: Unable to extract user ID from token');
      return [];
    }

    // Use standard user_books query with numeric user ID (not UUID)
    // Fetch ALL books without limit
    const query = `
      query UserReadBooks($userId: Int!) {
        user_books(
          where: { 
            user_id: { _eq: $userId }
            status_id: { _eq: 3 }
          }
          order_by: { updated_at: desc }
        ) {
          status_id
          rating
          book {
            id
            title
            description
            release_date
            pages
            image {
              url
            }
            contributions {
              author {
                name
              }
            }
          }
        }
      }
    `;

    try {
      // Convert user ID to number
      const userIdNum = parseInt(userId, 10);
      if (isNaN(userIdNum)) {
        this.log('User ID is not a valid number:', userId);
        return [];
      }

      const data = await this.query<{ user_books: any[] }>(query, {
        userId: userIdNum,
      });

      const readings: UserReading[] = [];

      for (const item of data.user_books || []) {
        const book = item.book;
        if (!book) continue;

        const authors = (book.contributions || [])
          .map((c: any) => c.author?.name)
          .filter(Boolean);

        const reading: UserReading = {
          bookId: parseInt(book.id),
          book: {
            id: parseInt(book.id),
            title: book.title || 'Unknown Title',
            author: authors[0] || 'Unknown Author',
            description: book.description,
            publishedDate: book.release_date,
            coverImageUrl: book.image?.url,
          },
          rating: item.rating ? item.rating * 2 : undefined, // Convert 5-star to 10-point
          status: 'read',
          finishedAt: undefined,
        };

        readings.push(reading);
      }

      this.log(`Fetched ${readings.length} read books from Hardcover (user ID: ${userIdNum})`);
      return readings;
    } catch (error) {
      this.log('Error fetching reading history:', error);
      return [];
    }
  }
}
