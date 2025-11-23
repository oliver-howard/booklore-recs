import { Request } from 'express';
import { RecommendationService } from '../recommendation-service.js';
import { DatabaseService } from '../database.js';
import { HardcoverClient } from '../hardcover-client.js';
import { logger } from '../logger.js';

/**
 * Service Factory
 * Manages RecommendationService instances per user session
 */
export class ServiceFactory {
  private sessionServices: Map<string, RecommendationService> = new Map();
  private globalHardcoverClient: HardcoverClient;

  constructor(globalHardcoverClient: HardcoverClient) {
    this.globalHardcoverClient = globalHardcoverClient;
  }

  /**
   * Get or create RecommendationService for a user session
   */
  async getService(req: Request): Promise<RecommendationService> {
    const sessionId = req.sessionID;
    logger.debug('Fetching RecommendationService for session', {
      sessionId,
      userId: req.session.userId,
    });

    // Check if user is authenticated
    if (!req.session.userId) {
      logger.warn('Attempted to access recommendation service without authentication', {
        sessionId,
      });
      throw new Error('Not authenticated. Please log in first.');
    }

    // Get user from database
    const user = DatabaseService.getUserById(req.session.userId);
    if (!user) {
      logger.warn('User not found for session', {
        sessionId,
        userId: req.session.userId,
      });
      throw new Error('User not found');
    }

    // Get or create service for this session
    let service = this.sessionServices.get(sessionId);

    if (!service) {
      logger.debug('Creating new RecommendationService instance', {
        sessionId,
        userId: user.id,
      });

      // Create user-specific HardcoverClient if user has API key (for reading history only)
      let userHardcoverClient: HardcoverClient | undefined;
      if (user.hardcoverApiKey) {
        userHardcoverClient = new HardcoverClient({
          apiToken: user.hardcoverApiKey,
        });
        logger.debug('Created user-specific HardcoverClient for reading history', {
          userId: user.id,
        });
      }

      // Create service with user's configured data sources
      service = new RecommendationService(
        undefined, // AI config (use defaults)
        user.bookloreUsername,
        user.booklorePassword,
        user.goodreadsReadings,
        user.dataSourcePreference,
        userHardcoverClient, // User's client for reading history
        this.globalHardcoverClient // Global client for book searches
      );

      // Only initialize (authenticate with BookLore) if credentials are configured
      if (user.bookloreUsername && user.booklorePassword) {
        await service.initialize();
        logger.info('BookLore service initialized', {
          username: user.username,
          sessionId,
        });
      } else {
        const readingsCount = user.goodreadsReadings?.length || 0;
        logger.info('Service ready using Goodreads data only', {
          username: user.username,
          readingsCount,
          sessionId,
        });
      }

      this.sessionServices.set(sessionId, service);
      req.session.initialized = true;
    }

    return service;
  }

  /**
   * Remove service instance for a session (e.g., on logout or settings change)
   */
  removeService(sessionId: string): void {
    this.sessionServices.delete(sessionId);
    logger.debug('Removed service for session', { sessionId });
  }

  /**
   * Get all active session IDs
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessionServices.keys());
  }
}
