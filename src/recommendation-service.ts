import { BookLoreClient } from './booklore-client.js';
import { AIService } from './ai-service.js';
import { Recommendation, ReadingAnalysis, RecommendationType, AIConfig } from './types.js';
import { config } from './config.js';

export class RecommendationService {
  private bookloreClient: BookLoreClient;
  private aiService: AIService;

  constructor(aiConfig?: Partial<AIConfig>, bookloreUsername?: string, booklorePassword?: string) {
    this.bookloreClient = new BookLoreClient(bookloreUsername, booklorePassword);
    this.aiService = new AIService(aiConfig);
  }

  /**
   * Initialize the service by authenticating with BookLore
   */
  async initialize(): Promise<void> {
    await this.bookloreClient.authenticate();
  }

  /**
   * Get recommendations based on type
   */
  async getRecommendations(
    type: RecommendationType = 'similar',
    maxRecommendations?: number
  ): Promise<Recommendation[] | ReadingAnalysis> {
    const max = maxRecommendations || config.ai.maxRecommendations;

    // Fetch user's reading history
    const readings = await this.bookloreClient.getUserReadingHistory();

    if (readings.length === 0) {
      throw new Error('No reading history found. Please read and rate some books first.');
    }

    console.log(`\nAnalyzing ${readings.length} books from your reading history...\n`);

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
    const readings = await this.bookloreClient.getUserReadingHistory();

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
    const readings = await this.bookloreClient.getUserReadingHistory();
    const ratedBooks = readings.filter((r) => r.rating);
    const genres = await this.bookloreClient.getUserFavoriteGenres();
    const authors = await this.bookloreClient.getUserFavoriteAuthors();

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
