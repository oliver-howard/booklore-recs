import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { RecommendationService } from './recommendation-service.js';
import { validateConfig } from './config.js';
import { Recommendation, ReadingAnalysis, TBRBook, UserReading, DataSourcePreference } from './types.js';
import { DatabaseService } from './database.js';
import { GoodreadsParser } from './goodreads-parser.js';
import { logger, requestLogger, currentLogLevel } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version?: string; name?: string };
const APP_VERSION = packageJson.version || '0.0.0';
const APP_NAME = packageJson.name || 'BookRex';

// Validate configuration on startup (but make BookLore credentials optional for web mode)
try {
  validateConfig();
  logger.debug('Configuration validated successfully');
} catch (error) {
  // In web mode, BookLore credentials are provided by users via UI
  logger.warn('Configuration validation warning (expected in web mode)', {
    message: error instanceof Error ? error.message : 'Unknown error',
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

function resolveTrustProxySetting(): any {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw.trim() === '') {
    return process.env.NODE_ENV === 'production' ? 1 : undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'false' || normalized === '0') {
    return undefined;
  }
  if (normalized === 'true') {
    return true;
  }

  const numeric = Number(raw);
  if (!Number.isNaN(numeric)) {
    return numeric;
  }

  return raw;
}

const trustProxySetting = resolveTrustProxySetting();
if (trustProxySetting !== undefined) {
  app.set('trust proxy', trustProxySetting);
  logger.info('Trust proxy enabled', { trustProxy: trustProxySetting });
}

// Middleware
app.use(cors());
app.use(express.json());
const secureCookies = process.env.SESSION_SECURE_COOKIES === 'true';
const sessionConfig: session.SessionOptions = {
  secret: process.env.SESSION_SECRET || 'booklore-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'lax',
  },
};

app.use(session(sessionConfig));
app.use(requestLogger);

logger.info('Session middleware configured', {
  secureCookies,
  cookieMaxAgeMs: sessionConfig.cookie?.maxAge,
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: currentLogLevel,
  trustProxy: trustProxySetting ?? false,
});

// Serve static files from public directory
// Disable default index to handle root route manually for cache busting
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath, { index: false }));

// Helper to serve HTML with cache-busted script tags
const serveHtml = (filePath: string, res: Response) => {
  const fs = require('fs');
  fs.readFile(filePath, 'utf8', (err: Error, data: string) => {
    if (err) {
      logger.error('Error reading HTML file', { error: err.message, path: filePath });
      return res.status(500).send('Internal Server Error');
    }
    // Inject version into app.js script tag
    const versionedHtml = data.replace(
      'src="/app.js"', 
      `src="/app.js?v=${APP_VERSION}"`
    ).replace(
      'src="/app.js?v=1.5.2"', // Handle the manual fix if present
      `src="/app.js?v=${APP_VERSION}"`
    ).replace(
      'href="/styles.css"',
      `href="/styles.css?v=${APP_VERSION}"`
    );
    
    res.send(versionedHtml);
  });
};

// Page routes
app.get('/', (req, res) => {
  serveHtml(path.join(publicPath, 'index.html'), res);
});

app.get('/settings', (req, res) => {
  serveHtml(path.join(publicPath, 'settings.html'), res);
});

app.get('/stats', (req, res) => {
  serveHtml(path.join(publicPath, 'stats.html'), res);
});

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
  let service = sessionServices.get(sessionId);

  if (!service) {
    logger.debug('Creating new RecommendationService instance', {
      sessionId,
      userId: user.id,
    });

    // Create service with user's configured data sources
    service = new RecommendationService(
      undefined, // AI config (use defaults)
      user.bookloreUsername,
      user.booklorePassword,
      user.goodreadsReadings,
      user.dataSourcePreference
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

// App version
app.get('/api/version', (_req: Request, res: Response) => {
  res.json({ version: APP_VERSION, name: APP_NAME });
});

// Authentication check
app.get(
  '/api/auth/status',
  asyncHandler(async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    if (req.session.userId) {
      const user = DatabaseService.getUserById(req.session.userId);
      if (user) {
        logger.debug('Auth status check: Authenticated', { username: user.username, userId: user.id });
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
          dataSourcePreference: user.dataSourcePreference || 'auto',
          canChooseDataSource: hasBookLore && hasGoodreads,
          isAdmin: user.isAdmin,
        });
        return;
      } else {
        logger.warn('Auth status check: User not found in DB', { userId: req.session.userId });
      }
    } else {
      logger.debug('Auth status check: No session userId');
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
      logger.warn('Registration attempt missing credentials', {
        usernameProvided: Boolean(username),
        ip: req.ip,
      });
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    try {
      logger.info('Registration attempt', {
        username,
        ip: req.ip,
      });
      const user = await DatabaseService.createUser(username, password);

      // Log user in immediately
      req.session.userId = user.id;
      req.session.initialized = true;

      logger.info('User registered successfully', {
        username: user.username,
        sessionId: req.sessionID,
      });

      res.json({
        success: true,
        message: 'Account created successfully',
        username: user.username,
      });
    } catch (error) {
      logger.warn('Registration failed', {
        username,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
      logger.warn('Login attempt missing credentials', {
        usernameProvided: Boolean(username),
        ip: req.ip,
      });
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    try {
      logger.info('Login attempt', {
        username,
        ip: req.ip,
        sessionId: req.sessionID,
      });
      const user = await DatabaseService.authenticateUser(username, password);

      req.session.userId = user.id;
      req.session.initialized = true;

      logger.info('Login successful', {
        username: user.username,
        userId: user.id,
        sessionId: req.sessionID,
      });

      res.json({
        success: true,
        message: 'Login successful',
        username: user.username,
      });
    } catch (error) {
      logger.warn('Login failed', {
        username,
        ip: req.ip,
        sessionId: req.sessionID,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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

// Update preferred data source
app.post(
  '/api/settings/data-source',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const { preference } = req.body as { preference: DataSourcePreference };

    if (!preference || !['auto', 'booklore', 'goodreads'].includes(preference)) {
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

    DatabaseService.updateDataSourcePreference(req.session.userId, preference);
    sessionServices.delete(req.sessionID);

    res.json({
      success: true,
      message: 'Data source preference updated',
    });
  })
);

// Logout
app.post(
  '/api/auth/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.sessionID;
    logger.info('Logout requested', {
      sessionId,
      userId: req.session.userId,
    });

    // Remove service instance
    sessionServices.delete(sessionId);

    // Clear session
    req.session.destroy((err) => {
      if (err) {
        logger.error('Error destroying session', {
          error: err instanceof Error ? err.message : err,
          sessionId,
        });
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
    const stats = await service.getUserStats(req.session.userId);
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

// Admin: list users
app.get(
  '/api/admin/users',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const user = DatabaseService.getUserById(req.session.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin privileges required' });
    }
    const users = DatabaseService.getAllUsers();
    res.json({ users });
  })
);

// Admin: delete user
app.delete(
  '/api/admin/users/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const currentUser = DatabaseService.getUserById(req.session.userId);
    if (!currentUser || !currentUser.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin privileges required' });
    }
    const targetId = parseInt(req.params.userId, 10);

    if (req.session.userId === targetId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account while logged in as admin.',
      });
    }

    DatabaseService.deleteUser(targetId);
    res.json({ success: true, message: 'User deleted' });
  })
);

// Admin: change password
app.post(
  '/api/admin/users/:userId/password',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const currentUser = DatabaseService.getUserById(req.session.userId);
    if (!currentUser || !currentUser.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin privileges required' });
    }
    const targetId = parseInt(req.params.userId, 10);
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    await DatabaseService.updateUserPassword(targetId, password);
    res.json({ success: true, message: 'Password updated' });
  })
);

// Admin: toggle admin role
app.post(
  '/api/admin/users/:userId/admin',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const currentUser = DatabaseService.getUserById(req.session.userId);
    if (!currentUser || !currentUser.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin privileges required' });
    }
    const targetId = parseInt(req.params.userId, 10);
    const { isAdmin } = req.body as { isAdmin: boolean };

    if (req.session.userId === targetId) {
      return res.status(400).json({
        success: false,
        message: 'Use another admin account to change your own role.',
      });
    }

    DatabaseService.updateAdminStatus(targetId, !!isAdmin);
    res.json({ success: true, message: 'User role updated' });
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
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    sessionId: req.sessionID,
  });

  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.DEBUG === 'true' && { stack: err.stack }),
  });
});

// Start server
app.listen(PORT, () => {
  logger.info('🚀 Book Rex Server started', {
    port: PORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    healthEndpoint: `/api/health`,
    logLevel: currentLogLevel,
  });
});
