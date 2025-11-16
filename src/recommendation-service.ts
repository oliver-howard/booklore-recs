import { BookLoreClient } from './booklore-client.js';
import { AIService } from './ai-service.js';
import { Recommendation, ReadingAnalysis, RecommendationType, AIConfig, UserReading } from './types.js';
import { config } from './config.js';

export class RecommendationService {
  private bookloreClient?: BookLoreClient;
  private aiService: AIService;
  private isGuestMode: boolean;
  private guestReadings?: UserReading[];

  constructor(
    aiConfig?: Partial<AIConfig>,
    bookloreUsername?: string,
    booklorePassword?: string,
    guestReadings?: UserReading[]
  ) {
    // Only create BookLore client if credentials are provided
    if (bookloreUsername && booklorePassword) {
      this.bookloreClient = new BookLoreClient(bookloreUsername, booklorePassword);
      this.isGuestMode = false;
    } else {
      this.isGuestMode = true;
      this.guestReadings = guestReadings;
    }
    this.aiService = new AIService(aiConfig);
  }

  /**
   * Initialize the service by authenticating with BookLore
   */
  async initialize(): Promise<void> {
    if (this.bookloreClient) {
      await this.bookloreClient.authenticate();
    }
  }

  /**
   * Get recommendations based on type
   */
  async getRecommendations(
    type: RecommendationType = 'similar',
    maxRecommendations?: number
  ): Promise<Recommendation[] | ReadingAnalysis> {
    const max = maxRecommendations || config.ai.maxRecommendations;
    let readings: UserReading[];

    // If guest mode with CSV data, use that
    if (this.isGuestMode && this.guestReadings && this.guestReadings.length > 0) {
      readings = this.guestReadings;
      console.log(`\nGuest mode with CSV: Analyzing ${readings.length} books from Goodreads...\n`);
    } else if (this.isGuestMode) {
      // Guest mode without CSV data
      throw new Error('This feature requires reading history. Please upload a Goodreads CSV or log in with your BookLore credentials.');
    } else {
      // BookLore mode
      readings = await this.bookloreClient!.getUserReadingHistory();

      if (readings.length === 0) {
        throw new Error('No reading history found. Please read and rate some books first.');
      }

      console.log(`\nAnalyzing ${readings.length} books from your reading history...\n`);
    }

    switch (type) {
      case 'similar':
        return this.aiService.getSimilarRecommendations(readings, max);
      case 'contrasting':
        return this.aiService.getContrastingRecommendations(readings, max);
      case 'blindspots':
        return this.aiService.analyzeReadingBlindSpots(readings);
      default:
        throw new Error(`Unknown recommendation type: ${type}`);
    }
  }

  /**
   * Get personalized recommendations based on custom criteria
   */
  async getCustomRecommendations(
    criteria: string,
    maxRecommendations?: number
  ): Promise<Recommendation[]> {
    const max = maxRecommendations || config.ai.maxRecommendations;

    // If guest mode with CSV data, use personalized recommendations
    if (this.isGuestMode && this.guestReadings && this.guestReadings.length > 0) {
      console.log(`\nGuest mode with CSV: Analyzing ${this.guestReadings.length} books from Goodreads...\n`);
      return this.aiService.getPersonalizedRecommendations(this.guestReadings, criteria, max);
    }

    // If guest mode without CSV data, use generic recommendations
    if (this.isGuestMode) {
      console.log('\nGuest mode: Generating recommendations based on criteria only...\n');
      return this.aiService.getGenericRecommendations(criteria, max);
    }

    const readings = await this.bookloreClient!.getUserReadingHistory();

    if (readings.length === 0) {
      throw new Error('No reading history found. Please read and rate some books first.');
    }

    console.log(`\nAnalyzing ${readings.length} books from your reading history...\n`);

    return this.aiService.getPersonalizedRecommendations(readings, criteria, max);
  }

  /**
   * Get user statistics
   */
  async getUserStats() {
    let readings: UserReading[];
    let genres: string[] = [];
    let authors: string[] = [];

    // If guest mode with CSV data, calculate from CSV
    if (this.isGuestMode && this.guestReadings && this.guestReadings.length > 0) {
      readings = this.guestReadings;

      // Calculate top genres from CSV data
      const genreCount = new Map<string, number>();
      readings.forEach(reading => {
        reading.book.genres?.forEach(genre => {
          genreCount.set(genre, (genreCount.get(genre) || 0) + 1);
        });
      });
      genres = Array.from(genreCount.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([genre]) => genre);

      // Calculate top authors from CSV data
      const authorCount = new Map<string, number>();
      readings.forEach(reading => {
        const author = reading.book.author;
        if (author) {
          authorCount.set(author, (authorCount.get(author) || 0) + 1);
        }
      });
      authors = Array.from(authorCount.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([author]) => author);
    } else if (this.isGuestMode) {
      throw new Error('Statistics require reading history. Please upload a Goodreads CSV or log in with your BookLore credentials.');
    } else {
      // BookLore mode
      readings = await this.bookloreClient!.getUserReadingHistory();
      genres = await this.bookloreClient!.getUserFavoriteGenres();
      authors = await this.bookloreClient!.getUserFavoriteAuthors();
    }

    const ratedBooks = readings.filter((r) => r.rating);

    return {
      totalBooksRead: readings.length,
      booksRated: ratedBooks.length,
      averageRating:
        ratedBooks.reduce((sum, r) => sum + (r.rating || 0), 0) / ratedBooks.length || 0,
      topGenres: genres.slice(0, 5),
      topAuthors: authors.slice(0, 5),
    };
  }

  /**
   * Format and display recommendations
   */
  static formatRecommendations(recommendations: Recommendation[]): string {
    if (recommendations.length === 0) {
      return 'No recommendations found.';
    }

    let output = '';
    recommendations.forEach((rec, index) => {
      output += `\n${index + 1}. "${rec.title}" by ${rec.author}\n`;
      output += `   ${rec.reasoning}\n`;
    });

    return output;
  }

  /**
   * Format and display reading analysis
   */
  static formatReadingAnalysis(analysis: ReadingAnalysis): string {
    let output = '\n=== READING PATTERNS ===\n';
    analysis.patterns.forEach((pattern, index) => {
      output += `${index + 1}. ${pattern}\n`;
    });

    output += '\n=== BLIND SPOTS & RECOMMENDATIONS ===\n';
    analysis.blindSpots.forEach((blindSpot, index) => {
      output += `\n${index + 1}. ${blindSpot.category}\n`;
      output += `   ${blindSpot.description}\n`;
      output += '\n   Recommended books to address this gap:\n';
      blindSpot.recommendations.forEach((rec, recIndex) => {
        output += `   ${recIndex + 1}. "${rec.title}" by ${rec.author}\n`;
        output += `      ${rec.reasoning}\n`;
      });
    });

    output += '\n=== SUGGESTED TOPICS TO EXPLORE ===\n';
    analysis.suggestedTopics.forEach((topic, index) => {
      output += `${index + 1}. ${topic}\n`;
    });

    return output;
  }
}
