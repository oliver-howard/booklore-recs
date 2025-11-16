import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { RecommendationService } from './recommendation-service.js';
import { validateConfig } from './config.js';
import { Recommendation, ReadingAnalysis, TBRBook, UserReading } from './types.js';
import { DatabaseService } from './database.js';
import { GoodreadsParser } from './goodreads-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate configuration on startup (but make BookLore credentials optional for web mode)
try {
  validateConfig();
} catch (error) {
  // In web mode, BookLore credentials are provided by users via UI
  console.log('Note: BookLore credentials will be provided via web interface');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'booklore-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

// Serve static files from public directory
// In development, serve from src/../public
// In production (dist/), serve from dist/../public
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// Session type declaration
declare module 'express-session' {
  interface SessionData {
    initialized: boolean;
    userId?: number; // Database user ID
  }
}

// Store service instances per session
const sessionServices = new Map<string, RecommendationService>();

// Initialize recommendation service for a user session
async function getService(req: Request): Promise<RecommendationService> {
  const sessionId = req.sessionID;

  // Check if user is authenticated
  if (!req.session.userId) {
    throw new Error('Not authenticated. Please log in first.');
  }

  // Get user from database
  const user = DatabaseService.getUserById(req.session.userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Get or create service for this session
  let service = sessionServices.get(sessionId);

  if (!service) {
    console.log('Creating new service instance for session:', sessionId.substring(0, 8) + '...');

    // Create service with user's configured data sources
    service = new RecommendationService(
      undefined, // AI config (use defaults)
      user.bookloreUsername,
      user.booklorePassword,
      user.goodreadsReadings
    );

    // Only initialize (authenticate with BookLore) if credentials are configured
    if (user.bookloreUsername && user.booklorePassword) {
      await service.initialize();
      console.log('Service initialized successfully for user:', user.username);
    } else {
      const readingsCount = user.goodreadsReadings?.length || 0;
      console.log(`Service created for user ${user.username} (${readingsCount} books from Goodreads CSV)`);
    }

    sessionServices.set(sessionId, service);
    req.session.initialized = true;
  }

  return service;
}

// Error handler middleware
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication check
app.get(
  '/api/auth/status',
  asyncHandler(async (req: Request, res: Response) => {
    if (req.session.userId) {
      const user = DatabaseService.getUserById(req.session.userId);
      if (user) {
        const hasBookLore = !!(user.bookloreUsername && user.booklorePassword);
        const hasGoodreads = !!(user.goodreadsReadings && user.goodreadsReadings.length > 0);
        const hasReadingHistory = hasBookLore || hasGoodreads;

        res.json({
          authenticated: true,
          username: user.username,
          hasReadingHistory,
          hasBookLore,
          hasGoodreads,
          booksCount: user.goodreadsReadings?.length || 0,
        });
        return;
      }
    }
    res.json({ authenticated: false });
  })
);

// Register new user
app.post(
  '/api/auth/register',
  asyncHandler(async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    try {
      const user = await DatabaseService.createUser(username, password);

      // Log user in immediately
      req.session.userId = user.id;
      req.session.initialized = true;

      res.json({
        success: true,
        message: 'Account created successfully',
        username: user.username,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Registration failed',
      });
    }
  })
);

// Login with local account
app.post(
  '/api/auth/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    try {
      const user = await DatabaseService.authenticateUser(username, password);

      req.session.userId = user.id;
      req.session.initialized = true;

      res.json({
        success: true,
        message: 'Login successful',
        username: user.username,
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: error instanceof Error ? error.message : 'Authentication failed',
      });
    }
  })
);

// ========== Settings Endpoints ==========

// Configure BookLore credentials
app.post(
  '/api/settings/booklore',
  asyncHandler(async (req: Request, res: Response) => {
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
      // Update credentials in database
      DatabaseService.updateBookLoreCredentials(req.session.userId, username, password);

      // Clear service instance to force re-initialization with new credentials
      sessionServices.delete(req.sessionID);

      res.json({
        success: true,
        message: 'BookLore credentials saved successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to save credentials',
      });
    }
  })
);

// Remove BookLore credentials
app.delete(
  '/api/settings/booklore',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    try {
      DatabaseService.clearBookLoreCredentials(req.session.userId);
      sessionServices.delete(req.sessionID);

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
  })
);

// Upload Goodreads CSV
app.post(
  '/api/settings/goodreads',
  asyncHandler(async (req: Request, res: Response) => {
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
      sessionServices.delete(req.sessionID);

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
  })
);

// Remove Goodreads data
app.delete(
  '/api/settings/goodreads',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    try {
      DatabaseService.clearGoodreadsReadings(req.session.userId);
      sessionServices.delete(req.sessionID);

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
  })
);

// Logout
app.post(
  '/api/auth/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.sessionID;

    // Remove service instance
    sessionServices.delete(sessionId);

    // Clear session
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
      }
    });

    res.json({ success: true, message: 'Logged out successfully' });
  })
);

// Get user statistics
app.get(
  '/api/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const service = await getService(req);
    const stats = await service.getUserStats();
    res.json(stats);
  })
);

// Get similar recommendations
app.post(
  '/api/recommendations/similar',
  asyncHandler(async (req: Request, res: Response) => {
    const service = await getService(req);
    const { maxRecommendations } = req.body;
    const tbrBooks = DatabaseService.getTBRList(req.session.userId!);
    const recommendations = await service.getRecommendations(
      'similar',
      maxRecommendations,
      tbrBooks
    );
    res.json({ recommendations });
  })
);

// Get contrasting recommendations
app.post(
  '/api/recommendations/contrasting',
  asyncHandler(async (req: Request, res: Response) => {
    const service = await getService(req);
    const { maxRecommendations } = req.body;
    const tbrBooks = DatabaseService.getTBRList(req.session.userId!);
    const recommendations = await service.getRecommendations(
      'contrasting',
      maxRecommendations,
      tbrBooks
    );
    res.json({ recommendations });
  })
);

// Get blind spots analysis
app.post(
  '/api/recommendations/blindspots',
  asyncHandler(async (req: Request, res: Response) => {
    const service = await getService(req);
    const analysis = (await service.getRecommendations('blindspots')) as ReadingAnalysis;
    res.json({ analysis });
  })
);

// Get custom recommendations
app.post(
  '/api/recommendations/custom',
  asyncHandler(async (req: Request, res: Response) => {
    const service = await getService(req);
    const { criteria, maxRecommendations } = req.body;

    if (!criteria) {
      return res.status(400).json({
        success: false,
        message: 'Criteria is required for custom recommendations',
      });
    }

    const tbrBooks = DatabaseService.getTBRList(req.session.userId!);
    const recommendations = await service.getCustomRecommendations(
      criteria,
      maxRecommendations,
      tbrBooks
    );
    res.json({ recommendations });
  })
);

// ========== TBR (To Be Read) Endpoints ==========

// Get user's TBR list
app.get(
  '/api/tbr',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const tbr = DatabaseService.getTBRList(req.session.userId);
    res.json({ tbr });
  })
);

// Add book to TBR
app.post(
  '/api/tbr',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const { title, author, reasoning, amazonUrl } = req.body;

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
  })
);

// Remove book from TBR
app.delete(
  '/api/tbr/:bookId',
  asyncHandler(async (req: Request, res: Response) => {
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
  })
);

// Clear entire TBR list
app.delete(
  '/api/tbr',
  asyncHandler(async (req: Request, res: Response) => {
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
  })
);

// ================================================

// Serve index.html for all other routes (SPA support)
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('=== ERROR ===');
  console.error('Message:', err.message);
  console.error('Stack:', err.stack);
  console.error('=============');

  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.DEBUG === 'true' && { stack: err.stack }),
  });
});

// Start server
app.listen(PORT, () => {
console.log(`\n🚀 Book Rex Server`);
  console.log(`   Server running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`\n   Press Ctrl+C to stop\n`);
});
