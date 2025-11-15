import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { RecommendationService } from './recommendation-service.js';
import { validateConfig } from './config.js';
import { Recommendation, ReadingAnalysis, TBRBook } from './types.js';
import { UserDataService } from './user-data-service.js';

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
    bookloreUsername?: string;
    booklorePassword?: string;
    isGuest?: boolean;
  }
}

// Store service instances per session
const sessionServices = new Map<string, RecommendationService>();

// Create user data service instance
const userDataService = new UserDataService();

// Initialize recommendation service for a user session
async function getService(req: Request): Promise<RecommendationService> {
  const sessionId = req.sessionID;

  // Check if user is a guest or has provided credentials
  if (!req.session.isGuest && (!req.session.bookloreUsername || !req.session.booklorePassword)) {
    throw new Error('BookLore credentials not configured. Please log in first.');
  }

  // Get or create service for this session
  let service = sessionServices.get(sessionId);

  if (!service) {
    console.log('Creating new service instance for session:', sessionId.substring(0, 8) + '...');

    // Create service with user-specific credentials (or undefined for guest)
    service = new RecommendationService(
      undefined, // AI config (use defaults)
      req.session.bookloreUsername,
      req.session.booklorePassword
    );

    // Only initialize (authenticate with BookLore) if not a guest
    if (!req.session.isGuest) {
      await service.initialize();
      console.log('Service initialized successfully for user:', req.session.bookloreUsername);
    } else {
      console.log('Service created for guest session (no BookLore authentication)');
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
    if (req.session.initialized && req.session.isGuest) {
      res.json({
        authenticated: true,
        isGuest: true,
        username: 'Guest',
      });
    } else if (req.session.initialized && req.session.bookloreUsername) {
      res.json({
        authenticated: true,
        isGuest: false,
        username: req.session.bookloreUsername,
      });
    } else {
      res.json({ authenticated: false });
    }
  })
);

// Login with BookLore credentials
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
      // Store credentials in session
      req.session.bookloreUsername = username;
      req.session.booklorePassword = password;

      // Try to initialize service (this will test the credentials)
      await getService(req);

      res.json({
        success: true,
        message: 'Login successful',
        username: username,
      });
    } catch (error) {
      // Clear credentials on failure
      delete req.session.bookloreUsername;
      delete req.session.booklorePassword;
      delete req.session.initialized;

      res.status(401).json({
        success: false,
        message: error instanceof Error ? error.message : 'Authentication failed',
      });
    }
  })
);

// Guest login (no BookLore credentials required)
app.post(
  '/api/auth/guest',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      // Mark session as guest
      req.session.isGuest = true;
      req.session.initialized = true;

      res.json({
        success: true,
        message: 'Guest session created',
        username: 'Guest',
        isGuest: true,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create guest session',
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
    const recommendations = await service.getRecommendations(
      'similar',
      maxRecommendations
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
    const recommendations = await service.getRecommendations(
      'contrasting',
      maxRecommendations
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

    const recommendations = await service.getCustomRecommendations(
      criteria,
      maxRecommendations
    );
    res.json({ recommendations });
  })
);

// ========== TBR (To Be Read) Endpoints ==========

// Get user's TBR list
app.get(
  '/api/tbr',
  asyncHandler(async (req: Request, res: Response) => {
    if (req.session.isGuest) {
      return res.status(403).json({
        success: false,
        message: 'TBR list is not available in guest mode',
      });
    }

    if (!req.session.bookloreUsername) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const tbr = await userDataService.getTBR(req.session.bookloreUsername);
    res.json({ tbr });
  })
);

// Add book to TBR
app.post(
  '/api/tbr',
  asyncHandler(async (req: Request, res: Response) => {
    if (req.session.isGuest) {
      return res.status(403).json({
        success: false,
        message: 'TBR list is not available in guest mode',
      });
    }

    if (!req.session.bookloreUsername) {
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

    // Generate ID for the book
    const id = UserDataService.generateBookId(title, author);

    try {
      const book = await userDataService.addToTBR(req.session.bookloreUsername, {
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
      if (error instanceof Error && error.message === 'Book already in TBR list') {
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
    if (req.session.isGuest) {
      return res.status(403).json({
        success: false,
        message: 'TBR list is not available in guest mode',
      });
    }

    if (!req.session.bookloreUsername) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const { bookId } = req.params;

    try {
      await userDataService.removeFromTBR(req.session.bookloreUsername, bookId);
      res.json({
        success: true,
        message: 'Book removed from TBR list',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Book not found in TBR list') {
        return res.status(404).json({
          success: false,
          message: 'Book not found in TBR list',
        });
      }
      throw error;
    }
  })
);

// Clear entire TBR list
app.delete(
  '/api/tbr',
  asyncHandler(async (req: Request, res: Response) => {
    if (req.session.isGuest) {
      return res.status(403).json({
        success: false,
        message: 'TBR list is not available in guest mode',
      });
    }

    if (!req.session.bookloreUsername) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    await userDataService.clearTBR(req.session.bookloreUsername);
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
  console.log(`\n🚀 BookLore Recommendations Server`);
  console.log(`   Server running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`\n   Press Ctrl+C to stop\n`);
});
