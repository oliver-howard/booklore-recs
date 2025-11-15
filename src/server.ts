import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { RecommendationService } from './recommendation-service.js';
import { validateConfig } from './config.js';
import { Recommendation, ReadingAnalysis } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate configuration on startup
validateConfig();

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
  }
}

// Create a single shared service instance
// In production, you might want one service per user
let sharedService: RecommendationService | null = null;

// Initialize recommendation service
async function getService(req: Request): Promise<RecommendationService> {
  // Initialize shared service if not already done
  if (!sharedService) {
    console.log('Initializing recommendation service...');
    sharedService = new RecommendationService();
    await sharedService.initialize();
    console.log('Service initialized successfully');
  }

  // Mark session as initialized
  req.session.initialized = true;

  return sharedService;
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
    if (req.session.initialized) {
      res.json({ authenticated: true });
    } else {
      res.json({ authenticated: false });
    }
  })
);

// Initialize session (authenticate with BookLore)
app.post(
  '/api/auth/init',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      await getService(req);
      res.json({ success: true, message: 'Authentication successful' });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: error instanceof Error ? error.message : 'Authentication failed',
      });
    }
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
