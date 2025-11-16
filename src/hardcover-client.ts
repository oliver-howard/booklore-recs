import { UserReading } from './types.js';

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

export interface HardcoverBook {
  id: number;
  title: string;
  contributions?: Array<{
    author?: {
      name: string;
    };
  }>;
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

  constructor(config: HardcoverConfig) {
    this.apiUrl = config.apiUrl || 'https://api.hardcover.app/v1/graphql';
    this.apiToken = config.apiToken.trim(); // Ensure no whitespace
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
   * Search for a book by title and author
   */
  async searchBook(title: string, author: string): Promise<HardcoverBook | null> {
    this.log(`Searching for book: "${title}" by ${author}`);

    // Use Hardcover's search endpoint which uses Typesense
    const searchQuery = author ? `${title} ${author}` : title;

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
      const data = await this.query<{ search: { results: { hits: any[] } } }>(query, {
        searchQuery,
        perPage: 10,
      });

      // The search results have this structure:
      // data.search.results.hits[] where each hit has a .document property
      const hits = data.search?.results?.hits || [];

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
        };
      });

      // Exact title match first
      let bestMatch = books.find(b =>
        b.title.toLowerCase() === title.toLowerCase()
      );

      // If no exact match, try author matching
      if (!bestMatch && author) {
        bestMatch = books.find(b => {
          const bookAuthors = b.contributions?.map((c: any) => c.author?.name.toLowerCase()) || [];
          return bookAuthors.some((a: any) =>
            a?.includes(author.toLowerCase()) || author.toLowerCase().includes(a || '')
          );
        });
      }

      // Otherwise just take first result
      if (!bestMatch) {
        bestMatch = books[0];
      }

      this.log('Best match:', bestMatch);
      return bestMatch;
    } catch (error) {
      this.log('Search error:', error);
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

  /**
   * Convert BookLore's 10-point rating system to Hardcover's 5-star scale
   */
  private convertRating(rating?: number | null): number | undefined {
    if (rating === undefined || rating === null) {
      return undefined;
    }

    const safeRating = Number(rating);
    if (Number.isNaN(safeRating)) {
      return undefined;
    }

    // If already on a 5-point scale, keep it as-is
    if (safeRating <= 5) {
      return safeRating;
    }

    const normalized = Math.min(10, Math.max(0, safeRating));
    const scaled = normalized / 2; // Convert 10-point to 5-point
    const rounded = Math.round(scaled * 2) / 2; // Allow half-star increments
    this.log(`Converted rating ${rating} → ${rounded} for Hardcover`);
    return rounded;
  }

  /**
   * Normalize finished date to ISO format
   */
  private normalizeFinishedAt(date?: string | null): string | undefined {
    if (!date) {
      return undefined;
    }

    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      this.log('Invalid finishedAt date, skipping:', date);
      return undefined;
    }

    return parsed.toISOString();
  }

  /**
   * Sync reading list from BookLore to Hardcover
   * This finds matching books and adds them with "Finished" status
   */
  async syncReadingList(readings: UserReading[]): Promise<{
    successful: number;
    failed: number;
    notFound: number;
    details: Array<{ title: string; author: string; success: boolean; reason?: string }>;
  }> {
    this.log(`Starting sync of ${readings.length} books`);

    let successful = 0;
    let failed = 0;
    let notFound = 0;
    const details: Array<{ title: string; author: string; success: boolean; reason?: string }> = [];

    for (const reading of readings) {
      const title = reading.book.title;
      const author = reading.book.author || 'Unknown';

      try {
        // Search for book on Hardcover
        const book = await this.searchBook(title, author);

        if (!book) {
          notFound++;
          details.push({ title, author, success: false, reason: 'Book not found on Hardcover' });
          continue;
        }

        // Add to library with "Finished" status (3) and scaled rating if available
        const hardcoverRating = this.convertRating(reading.rating);
        const finishedAt = this.normalizeFinishedAt(reading.finishedAt);
        const added = await this.addBookToLibrary(book.id, 3, hardcoverRating, finishedAt);

        if (added) {
          successful++;
          details.push({ title, author, success: true });
        } else {
          failed++;
          details.push({ title, author, success: false, reason: 'Failed to add to library' });
        }

        // Rate limiting: wait 3 seconds between requests to avoid throttling
        // Hardcover API is very aggressive with rate limiting
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        failed++;
        details.push({
          title,
          author,
          success: false,
          reason: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    this.log(`Sync complete: ${successful} successful, ${failed} failed, ${notFound} not found`);

    return { successful, failed, notFound, details };
  }
}
