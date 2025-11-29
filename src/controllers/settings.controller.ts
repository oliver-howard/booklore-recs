import { Request, Response } from 'express';
import { DatabaseService } from '../database.js';
import { GoodreadsParser } from '../goodreads-parser.js';
import { ServiceFactory } from '../services/service-factory.js';
import { BookLoreClient } from '../booklore-client.js';
import { HardcoverClient } from '../hardcover-client.js';
import { DataSourcePreference } from '../types.js';

/**
 * Settings Controller
 * Handles user settings routes
 */
export class SettingsController {
  private serviceFactory: ServiceFactory;

  constructor(serviceFactory: ServiceFactory) {
    this.serviceFactory = serviceFactory;
  }

  /**
   * Configure BookLore credentials
   * POST /api/settings/booklore
   */
  saveBookLoreCredentials = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    try {
      // Verify credentials first
      const client = new BookLoreClient(username, password);
      await client.authenticate();

      // Update credentials in database
      DatabaseService.updateBookLoreCredentials(req.session.userId, username, password);

      // Clear service instance to force re-initialization with new credentials
      this.serviceFactory.removeService(req.sessionID);

      res.json({
        success: true,
        message: 'BookLore credentials saved successfully',
      });
    } catch (error) {
      // Check if it's an authentication error
      const errorMessage = error instanceof Error ? error.message : 'Failed to save credentials';
      const isAuthError = errorMessage.includes('Authentication failed') || errorMessage.includes('401') || errorMessage.includes('403');
      
      res.status(isAuthError ? 400 : 500).json({
        success: false,
        message: errorMessage,
      });
    }
  };

  /**
   * Remove BookLore credentials
   * DELETE /api/settings/booklore
   */
  removeBookLoreCredentials = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    try {
      DatabaseService.clearBookLoreCredentials(req.session.userId);
      this.serviceFactory.removeService(req.sessionID);

      res.json({
        success: true,
        message: 'BookLore credentials removed',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove credentials',
      });
    }
  };

  /**
   * Configure Hardcover credentials
   * POST /api/settings/hardcover
   */
  saveHardcoverCredentials = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'API Key is required',
      });
    }

    try {
      // Verify the API key before saving
      const verification = await HardcoverClient.verifyApiKey(apiKey);
      
      if (!verification.valid) {
        return res.status(400).json({
          success: false,
          message: verification.error || 'Invalid API key',
        });
      }
      
      // Save verified credentials
      DatabaseService.updateHardcoverCredentials(req.session.userId, apiKey);
      
      // Clear service instance to force re-initialization
      this.serviceFactory.removeService(req.sessionID);

      res.json({
        success: true,
        message: 'Hardcover API Key saved successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to save credentials',
      });
    }
  };

  /**
   * Remove Hardcover credentials
   * DELETE /api/settings/hardcover
   */
  removeHardcoverCredentials = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    try {
      DatabaseService.clearHardcoverCredentials(req.session.userId);
      this.serviceFactory.removeService(req.sessionID);

      res.json({
        success: true,
        message: 'Hardcover credentials removed',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove credentials',
      });
    }
  };

  /**
   * Upload Goodreads CSV
   * POST /api/settings/goodreads
   */
  uploadGoodreads = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const { csvContent } = req.body;

    if (!csvContent || typeof csvContent !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'CSV content is required',
      });
    }

    try {
      const readings = GoodreadsParser.parseCSV(csvContent);

      if (readings.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No read books found in CSV file. Make sure you have books marked as "read" in Goodreads.',
        });
      }

      DatabaseService.updateGoodreadsReadings(req.session.userId, readings);
      this.serviceFactory.removeService(req.sessionID);

      res.json({
        success: true,
        message: `Successfully imported ${readings.length} books from Goodreads`,
        booksCount: readings.length,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to parse CSV file',
      });
    }
  };

  /**
   * Remove Goodreads data
   * DELETE /api/settings/goodreads
   */
  removeGoodreads = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    try {
      DatabaseService.clearGoodreadsReadings(req.session.userId);
      this.serviceFactory.removeService(req.sessionID);

      res.json({
        success: true,
        message: 'Goodreads data removed',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove Goodreads data',
      });
    }
  };

  /**
   * Update preferred data source
   * POST /api/settings/data-source
   */
  updateDataSource = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const { preference } = req.body as { preference: DataSourcePreference };

    if (!preference || !['auto', 'booklore', 'goodreads', 'hardcover'].includes(preference)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data source preference',
      });
    }

    const user = DatabaseService.getUserById(req.session.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const hasBookLore = !!(user.bookloreUsername && user.booklorePassword);
    const hasGoodreads = !!(user.goodreadsReadings && user.goodreadsReadings.length > 0);
    const hasHardcover = !!user.hardcoverApiKey;

    if (preference === 'booklore' && !hasBookLore) {
      return res.status(400).json({
        success: false,
        message: 'Connect BookLore to use it as a data source.',
      });
    }

    if (preference === 'goodreads' && !hasGoodreads) {
      return res.status(400).json({
        success: false,
        message: 'Upload Goodreads data to use it as a data source.',
      });
    }

    if (preference === 'hardcover' && !hasHardcover) {
      return res.status(400).json({
        success: false,
        message: 'Connect Hardcover to use it as a data source.',
      });
    }

    DatabaseService.updateDataSourcePreference(req.session.userId, preference);
    this.serviceFactory.removeService(req.sessionID);

    res.json({
      success: true,
      message: 'Data source preference updated',
    });
  };

  /**
   * Get exclusion list
   * GET /api/exclusion
   */
  getExclusionList = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    try {
      const list = DatabaseService.getExclusionList(req.session.userId);
      res.json({ list });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get exclusion list',
      });
    }
  };

  /**
   * Add to exclusion list
   * POST /api/exclusion
   */
  addToExclusionList = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const { book } = req.body;

    if (!book || !book.title || !book.author) {
      return res.status(400).json({
        success: false,
        message: 'Book title and author are required',
      });
    }

    try {
      // Generate ID if not provided
      // Generate ID if not provided
      // Actually, generateBookId was in UserDataService. I should check if I moved it or need to implement it here.
      // Let's implement a simple ID generation here or check if I can reuse something.
      // I'll implement a local helper or add it to DatabaseService.
      // For now, let's assume the client sends the ID or we generate it.
      
      const id = book.id || `${book.title.toLowerCase()}-${book.author.toLowerCase()}`.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

      const newBook = DatabaseService.addToExclusionList(req.session.userId, {
        ...book,
        id,
      });

      res.json({
        success: true,
        message: 'Book added to exclusion list',
        book: newBook,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to add to exclusion list',
      });
    }
  };

  /**
   * Remove from exclusion list
   * DELETE /api/exclusion/:bookId
   */
  removeFromExclusionList = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const { bookId } = req.params;

    try {
      DatabaseService.removeFromExclusionList(req.session.userId, bookId);
      res.json({
        success: true,
        message: 'Book removed from exclusion list',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove from exclusion list',
      });
    }
  };
}
