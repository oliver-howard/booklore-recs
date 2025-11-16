import { UserReading } from './types.js';

interface GoodreadsRow {
  'Book Id': string;
  'Title': string;
  'Author': string;
  'My Rating': string;
  'Average Rating': string;
  'Date Read': string;
  'Exclusive Shelf': string;
  'My Review': string;
  'Private Notes': string;
  'Bookshelves': string;
  'Year Published': string;
  'Number of Pages': string;
  'Publisher': string;
}

/**
 * Parse Goodreads library export CSV into UserReading format
 * Handles Goodreads 5-star rating system and converts to BookLore's 10-point scale
 */
export class GoodreadsParser {
  /**
   * Parse CSV content into UserReading objects
   * Only includes books with 'read' status
   */
  static parseCSV(csvContent: string): UserReading[] {
    const lines = csvContent.split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file is empty or invalid');
    }

    // Parse header row
    const headers = this.parseCSVLine(lines[0]);
    const readings: UserReading[] = [];

    // Parse data rows (skip header)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      try {
        const values = this.parseCSVLine(line);
        const row: any = {};

        // Map values to headers
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        // Only include books that have been read
        if (row['Exclusive Shelf'] !== 'read') {
          continue;
        }

        // Convert to UserReading format
        const reading = this.convertToUserReading(row, i + 1);
        if (reading) {
          readings.push(reading);
        }
      } catch (error) {
        console.warn(`Warning: Failed to parse line ${i + 1}:`, error);
        // Continue parsing other lines
      }
    }

    console.log(`Parsed ${readings.length} read books from Goodreads CSV`);
    return readings;
  }

  /**
   * Parse a single CSV line, handling quoted fields and commas within quotes
   */
  private static parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Escaped quote
          currentValue += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        // End of field
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // Add last field
    values.push(currentValue.trim());

    return values;
  }

  /**
   * Convert Goodreads row to UserReading format
   */
  private static convertToUserReading(row: GoodreadsRow, lineNumber: number): UserReading | null {
    const title = row['Title']?.trim();
    const author = row['Author']?.trim();

    if (!title) {
      console.warn(`Warning: Missing title on line ${lineNumber}, skipping`);
      return null;
    }

    // Parse rating - Goodreads uses 0-5 scale, BookLore uses 1-10 scale
    // 0 in Goodreads means not rated
    let rating: number | undefined;
    const myRating = parseInt(row['My Rating'] || '0');
    if (myRating > 0) {
      // Convert 5-star scale to 10-point scale by multiplying by 2
      rating = myRating * 2;
    }

    // Extract genres from bookshelves (comma-separated)
    const bookshelves = row['Bookshelves']?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const genres = bookshelves.filter(shelf =>
      !['to-read', 'currently-reading', 'read', 'dnf', 'owned'].includes(shelf)
    );

    // Parse date read
    let finishedAt: string | undefined;
    if (row['Date Read']) {
      try {
        // Goodreads format: YYYY/MM/DD
        const dateStr = row['Date Read'].trim();
        if (dateStr) {
          const [year, month, day] = dateStr.split('/');
          finishedAt = new Date(`${year}-${month}-${day}`).toISOString();
        }
      } catch (error) {
        console.warn(`Warning: Invalid date format on line ${lineNumber}: ${row['Date Read']}`);
      }
    }

    // Combine review and notes (clean HTML from reviews)
    let combinedNotes = '';
    if (row['My Review']) {
      combinedNotes += this.cleanHTML(row['My Review'].trim());
    }
    if (row['Private Notes']) {
      if (combinedNotes) combinedNotes += '\n\n';
      combinedNotes += `Notes: ${this.cleanHTML(row['Private Notes'].trim())}`;
    }

    // Create UserReading object
    const reading: UserReading = {
      bookId: parseInt(row['Book Id']) || Math.floor(Math.random() * 1000000),
      book: {
        id: parseInt(row['Book Id']) || Math.floor(Math.random() * 1000000),
        title,
        author,
        genres: genres.length > 0 ? genres : undefined,
        publishedDate: row['Year Published'] ? `${row['Year Published']}-01-01` : undefined,
      },
      rating,
      status: 'read',
      finishedAt,
      review: combinedNotes || undefined,
      notes: row['Private Notes'] ? this.cleanHTML(row['Private Notes'].trim()) : undefined,
    };

    return reading;
  }

  /**
   * Clean HTML tags from review text
   */
  private static cleanHTML(text: string): string {
    if (!text) return '';
    return text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[^>]+(>|$)/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }
}
