import { Request, Response } from 'express';
import { DatabaseService } from '../database.js';
import { HardcoverClient } from '../hardcover-client.js';
import { logger } from '../logger.js';

/**
 * TBR (To Be Read) Controller
 * Handles TBR list and book details routes
 */
export class TBRController {
  private hardcoverClient: HardcoverClient;

  constructor(hardcoverClient: HardcoverClient) {
    this.hardcoverClient = hardcoverClient;
  }

  /**
   * Get book details from Hardcover
   * GET /api/books/details
   */
  getBookDetails = async (req: Request, res: Response) => {
    const { title, author } = req.query;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Title is required',
      });
    }

    const authorStr = typeof author === 'string' ? author : '';

    try {
      const details = await this.hardcoverClient.getBookDetails(title, authorStr);
      res.json({ success: true, details });
    } catch (error) {
      logger.error('Error fetching book details', {
        error: error instanceof Error ? error.message : 'Unknown error',
        title,
        author,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch book details',
      });
    }
  };

  /**
   * Get user's TBR list
   * GET /api/tbr
   */
  getTBRList = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    let tbr = DatabaseService.getTBRList(req.session.userId);

    // Backfill missing covers
    const missingCovers = tbr.filter(book => !book.coverUrl);
    if (missingCovers.length > 0) {
      logger.info(`Backfilling covers for ${missingCovers.length} TBR books`);
      
      await Promise.all(missingCovers.map(async (book) => {
        try {
          const details = await this.hardcoverClient.getBookDetails(book.title, book.author);
          if (details && details.images && details.images.length > 0) {
            const coverUrl = details.images[0].url;
            // Update database
            book.coverUrl = coverUrl;
            DatabaseService.updateTBRBookCover(req.session.userId!, book.id, coverUrl);
          }
        } catch (error) {
          logger.error(`Failed to backfill cover for ${book.title}`, error as any);
        }
      }));
    }

    res.json({ tbr });
  };

  /**
   * Add book to TBR
   * POST /api/tbr
   */
  addToTBR = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const { title, author, reasoning, amazonUrl, coverUrl } = req.body;

    if (!title || !author) {
      return res.status(400).json({
        success: false,
        message: 'Title and author are required',
      });
    }

    // Generate ID for the book (simple hash of title + author)
    const id = `${title.toLowerCase().replace(/\s+/g, '-')}-${author.toLowerCase().replace(/\s+/g, '-')}`;

    try {
      const book = DatabaseService.addToTBR(req.session.userId, {
        id,
        title,
        author,
        reasoning,
        amazonUrl,
        coverUrl,
      });

      res.json({
        success: true,
        book,
        message: 'Book added to TBR list',
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        return res.status(409).json({
          success: false,
          message: 'Book is already in your TBR list',
        });
      }
      throw error;
    }
  };

  /**
   * Remove book from TBR
   * DELETE /api/tbr/:bookId
   */
  removeFromTBR = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const { bookId } = req.params;

    try {
      DatabaseService.removeFromTBR(req.session.userId, bookId);
      res.json({
        success: true,
        message: 'Book removed from TBR list',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove book',
      });
    }
  };

  /**
   * Clear entire TBR list
   * DELETE /api/tbr
   */
  clearTBR = async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    DatabaseService.clearTBR(req.session.userId);
    res.json({
      success: true,
      message: 'TBR list cleared',
    });
  };
}
