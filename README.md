# BookLore AI Book Recommendations

An AI-powered book recommendation system that uses your reading history and ratings from BookLore to provide personalized book suggestions. This system LLMs to analyze your reading patterns and suggest books you'll love.

## Features

- **Dual Interface:**
  - **Web Application**: User-friendly browser interface with session-based authentication
  - **CLI**: Fast command-line interface for terminal users

- **Multiple Recommendation Types:**
  - **Similar Books**: Get recommendations based on books you've enjoyed
  - **Contrasting Perspectives**: Discover books that challenge your current viewpoints
  - **Blind Spots Analysis**: Identify gaps in your reading and get suggestions to broaden your horizons
  - **Custom Recommendations**: Specify your own criteria for personalized suggestions

- **Multi-LLM Support:**
  - Anthropic Claude (default)
  - OpenAI ChatGPT
  - Google Gemini

- **Amazon Integration**: Direct links to purchase recommended books on Amazon

- **Reading Statistics**: View your reading patterns, favorite genres, and top authors

- **Secure Authentication**:
  - Web mode: Login via UI with session-based credential isolation
  - CLI mode: Credentials via environment variables

## Installation

### Option 1: Docker (Recommended for Self-Hosting)

1. Clone the repository:
```bash
cd booklore_recs
```

2. Configure your environment:
```bash
cp .env.example .env
```

3. Edit `.env` with your credentials:
```env
# BookLore API Configuration
BOOKLORE_API_URL=https://api.booklore.app
# Note: BookLore credentials are entered via web UI login, not here

# AI Provider Configuration (choose one)
ANTHROPIC_API_KEY=your_anthropic_key
# or
OPENAI_API_KEY=your_openai_key
# or
GOOGLE_API_KEY=your_google_key

# Default AI Provider
DEFAULT_AI_PROVIDER=google

# Web Server Configuration
PORT=3000
SESSION_SECRET=your-random-secret-string-here

# Optional: Amazon Affiliate Integration
# AMAZON_AFFILIATE_TAG=your-affiliate-tag
```

4. Start the container:
```bash
docker-compose up -d
```

5. Access the web interface at [http://localhost:3000](http://localhost:3000)

6. Log in with your BookLore credentials:
   - Enter your BookLore username and password
   - Credentials are stored securely in your session
   - Each user session is isolated for security

7. Check container health:
```bash
docker-compose ps
docker-compose logs -f
```

8. Stop the container:
```bash
docker-compose down
```

### Option 2: Local Installation (CLI and Web)

1. Clone the repository:
```bash
cd booklore_recs
```

2. Install dependencies:
```bash
npm install
```

3. Configure your environment:
```bash
cp .env.example .env
```

4. Edit `.env` with your credentials (same as above)

5. Build the project:
```bash
npm run build
```

## Usage

### Web Interface

The web interface provides an easy-to-use dashboard for getting recommendations:

**Start the web server (local development):**
```bash
npm run web:dev
```

**Or run in production mode:**
```bash
npm run web:build
npm run web:start
```

**Access the interface:**
1. Open your browser to [http://localhost:3000](http://localhost:3000)
2. **Log in** with your BookLore credentials (username and password)
3. Click on different tabs to explore:
   - **Similar Books**: Get recommendations based on your reading history
   - **Contrasting**: Discover challenging perspectives
   - **Blind Spots**: Analyze your reading patterns
   - **Custom**: Enter specific criteria for recommendations
   - **Statistics**: View your reading stats

**Amazon Links:**
- Each recommendation includes a "View on Amazon →" button
- Links to Amazon search results for the book
- Optionally configure affiliate tag in `.env` for monetization

**API Endpoints:**

If you want to integrate with the API directly:

- `GET /api/health` - Health check
- `GET /api/auth/status` - Check authentication status
- `POST /api/auth/login` - Login with BookLore credentials
- `POST /api/auth/logout` - Logout and clear session
- `GET /api/stats` - Get reading statistics
- `POST /api/recommendations/similar` - Get similar book recommendations
- `POST /api/recommendations/contrasting` - Get contrasting recommendations
- `POST /api/recommendations/blindspots` - Get blind spots analysis
- `POST /api/recommendations/custom` - Get custom recommendations (requires `criteria` in request body)

### CLI Commands (Command Line Interface)

You can also use the CLI for quick terminal-based access.

**Note:** For CLI mode, you must configure `BOOKLORE_USERNAME` and `BOOKLORE_PASSWORD` in your `.env` file.

**Get similar book recommendations:**
```bash
npm run recommend similar
# or shorthand:
npm run recommend s
```

**Get contrasting perspectives:**
```bash
npm run recommend contrasting
# or shorthand:
npm run recommend c
```

**Analyze reading blind spots:**
```bash
npm run recommend blindspots
# or shorthand:
npm run recommend b
```

**Get custom recommendations:**
```bash
npm run recommend custom "science fiction with strong female protagonists"
npm run recommend custom "historical fiction set in ancient Rome"
npm run recommend custom "non-fiction about climate change"
```

**View reading statistics:**
```bash
npm run recommend stats
```

**Show help:**
```bash
npm run recommend help
```

### Development Mode

Run without building:
```bash
npm run dev similar
npm run dev contrasting
npm run dev blindspots
```

## How It Works

### Architecture

This system uses a **direct prompting approach** (no embeddings or vector databases) similar to the Unearthed app:

1. **Data Collection**: Fetches your reading history from BookLore API
   - Books you've read
   - Your ratings and reviews
   - Genres and authors

2. **Context Building**: Formats your reading data for the LLM
   - Includes book titles, authors, genres
   - Incorporates your ratings and reviews
   - Maintains context about books you've already read

3. **AI Analysis**: Sends structured prompts to the LLM
   - Uses role-based prompting (e.g., "You are a book recommendation expert")
   - Provides clear instructions for output format
   - Requests specific reasoning for each recommendation

4. **Response Processing**: Cleans and parses AI responses
   - Removes markdown artifacts
   - Handles special characters
   - Validates JSON structure

### Recommendation Types Explained

#### Similar Books
Recommends books based on themes, writing styles, and genres you've enjoyed. The AI considers:
- Books you've rated highly
- Common themes across your favorites
- Authors and genres you prefer
- Your written reviews

#### Contrasting Perspectives
Helps you break out of echo chambers by suggesting books that:
- Challenge assumptions in books you've read
- Present opposing viewpoints
- Offer alternative ideological frameworks
- Explore different cultural perspectives

This feature is inspired by Unearthed's approach to intellectual diversity.

#### Blind Spots Analysis
Provides a comprehensive analysis of your reading patterns, including:
- **Reading Patterns**: Observable trends in your book selection
- **Blind Spots**: Areas you haven't explored (e.g., geographic diversity, time periods, genres)
- **Recommendations**: 2-3 books for each identified blind spot
- **Suggested Topics**: New areas to explore based on your interests

## Configuration

### Environment Variables

| Variable | Description | Default | Required For |
|----------|-------------|---------|--------------|
| `BOOKLORE_API_URL` | BookLore API base URL | `https://api.booklore.app` | All modes |
| `BOOKLORE_USERNAME` | Your BookLore username | - | CLI only |
| `BOOKLORE_PASSWORD` | Your BookLore password | - | CLI only |
| `DEFAULT_AI_PROVIDER` | AI provider to use | `anthropic` | All modes |
| `ANTHROPIC_API_KEY` | Anthropic API key | - | If using Claude |
| `OPENAI_API_KEY` | OpenAI API key | - | If using ChatGPT |
| `GOOGLE_API_KEY` | Google API key | - | If using Gemini |
| `AI_TEMPERATURE` | Creativity level (0.0-1.0) | `0.7` | Optional |
| `MAX_RECOMMENDATIONS` | Number of recommendations | `5` | Optional |
| `PORT` | Web server port | `3000` | Web mode |
| `SESSION_SECRET` | Session encryption secret | Random string | Web mode (production) |
| `AMAZON_AFFILIATE_TAG` | Amazon affiliate tag | - | Optional |

**Note on Authentication:**
- **Web mode**: BookLore credentials are entered via UI login, not `.env`
- **CLI mode**: BookLore credentials must be in `.env` file

### Custom AI Models

You can specify custom models in `.env`:

```env
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
OPENAI_MODEL=gpt-4-turbo-preview
GOOGLE_MODEL=gemini-pro
```

## API Structure

### BookLore Client

The `BookLoreClient` class handles all interactions with the BookLore API:

```typescript
// With dynamic credentials (web mode)
const client = new BookLoreClient(username, password);
await client.authenticate();

// With env credentials (CLI mode)
const client = new BookLoreClient();
await client.authenticate();

// Get user's reading history
const readings = await client.getUserReadingHistory();

// Get favorite genres
const genres = await client.getUserFavoriteGenres();

// Get favorite authors
const authors = await client.getUserFavoriteAuthors();
```

### AI Service

The `AIService` class manages LLM interactions:

```typescript
const aiService = new AIService({
  provider: 'anthropic',
  apiKey: 'your-key',
  temperature: 0.7
});

// Get similar recommendations
const recommendations = await aiService.getSimilarRecommendations(readings, 5);

// Analyze blind spots
const analysis = await aiService.analyzeReadingBlindSpots(readings);
```

### Recommendation Service

The `RecommendationService` combines BookLore and AI:

```typescript
// With dynamic credentials (web mode)
const service = new RecommendationService(
  undefined,  // AI config (use defaults)
  username,
  password
);
await service.initialize();

// With env credentials (CLI mode)
const service = new RecommendationService();
await service.initialize();

// Get recommendations by type
const recs = await service.getRecommendations('similar');

// Get custom recommendations
const custom = await service.getCustomRecommendations(
  'science fiction with AI themes'
);
```

## Example Output

### Similar Recommendations
```
=== SIMILAR BOOK RECOMMENDATIONS ===

1. "Project Hail Mary" by Andy Weir
   Based on your enjoyment of "The Martian," this book shares the same blend of
   hard science fiction, humor, and a protagonist using scientific problem-solving
   to survive against impossible odds.
   [View on Amazon →]

2. "Recursion" by Blake Crouch
   Given your high rating of "Dark Matter," you'll appreciate Crouch's exploration
   of another mind-bending scientific concept with emotional depth and thriller pacing.
   [View on Amazon →]
```

**Note:** Each recommendation includes an Amazon search link for easy purchasing.

### Blind Spots Analysis
```
=== READING PATTERNS ===
1. Strong preference for contemporary science fiction and thriller genres
2. Focus on male American and British authors from the last 20 years
3. High engagement with fast-paced, plot-driven narratives

=== BLIND SPOTS & RECOMMENDATIONS ===

1. Geographic Diversity
   Your reading history is primarily Western-centric. Exploring translated
   literature could provide fresh perspectives.

   Recommended books:
   1. "Pachinko" by Min Jin Lee
      A multi-generational epic offering Korean perspectives on identity and belonging
   2. "The Three-Body Problem" by Liu Cixin
      Hard science fiction from a Chinese author with unique cultural context
```

## Project Structure

```
booklore_recs/
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── server.ts                   # Web server (Express.js)
│   ├── config.ts                   # Configuration management
│   ├── types.ts                    # TypeScript type definitions
│   ├── booklore-client.ts          # BookLore API client
│   ├── ai-service.ts               # Multi-LLM AI service
│   ├── recommendation-service.ts   # Main recommendation logic
│   └── utils.ts                    # Utility functions (Amazon links)
├── public/
│   ├── index.html                  # Web interface with login modal
│   ├── styles.css                  # Styles
│   └── app.js                      # Frontend JavaScript
├── Dockerfile                      # Container definition
├── docker-compose.yml              # Docker Compose configuration
├── .dockerignore                   # Docker ignore file
├── CLAUDE.md                       # AI assistant instructions
├── QUICKSTART.md                   # Quick start guide
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Technical Details

### No Embeddings or Vector Databases

Unlike many recommendation systems, this uses a **direct prompting approach**:

**Advantages:**
- Simpler architecture
- No need to maintain vector databases
- Leverages LLM's built-in book knowledge
- Easier to customize prompts
- Lower infrastructure costs

**Trade-offs:**
- Higher per-request costs
- Slower than vector similarity search
- Limited by context window size

This approach is ideal for personal use or small user bases where simplicity and customization matter more than scale.

### Prompt Engineering

The system uses structured prompts with:
- **Role definition**: "You are a book recommendation expert"
- **Clear instructions**: Specific output format requirements
- **Context provision**: User's reading history with ratings
- **Constraints**: JSON format, character limitations, exclusions

### Response Cleaning

Implements robust JSON parsing like Unearthed:
- Removes markdown code blocks
- Replaces special characters (em dashes, smart quotes)
- Attempts extraction if JSON is embedded
- Graceful error handling

## Troubleshooting

### Authentication Issues

**Web Mode:**
- Ensure you're entering correct BookLore credentials in the login modal
- Check browser console for any error messages
- Verify the BookLore API URL in `.env`
- Try logging out and back in

**CLI Mode:**
- Verify BookLore credentials in `.env` file
- Check if the API URL is correct
- Ensure your account is active
- Run with `DEBUG=true` for detailed logging

### API Key Issues
- Confirm the correct API key for your chosen provider
- Check that the provider name matches: `anthropic`, `openai`, or `google`
- Verify API key has sufficient credits/quota

### No Recommendations Returned
- Ensure you have books in your reading history
- Try rating some books in BookLore
- Check that books have metadata (title, author, etc.)

### JSON Parsing Errors
- Usually auto-corrected by the cleaning function
- If persistent, try a different AI provider
- Check AI temperature (lower = more consistent)

## Docker Deployment

### Using Docker Compose (Recommended)

The easiest way to deploy is using Docker Compose:

```bash
# Start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down
```

### Manual Docker Build

If you prefer to build manually:

```bash
# Build the image
docker build -t booklore-recs .

# Run the container
docker run -d \
  --name booklore-recommendations \
  -p 3000:3000 \
  --env-file .env \
  booklore-recs

# View logs
docker logs -f booklore-recommendations

# Stop the container
docker stop booklore-recommendations
docker rm booklore-recommendations
```

### Production Deployment

For production deployment, consider:

1. **Reverse Proxy**: Use Nginx or Traefik to handle HTTPS
2. **Environment Variables**: Store secrets securely (e.g., using Docker secrets)
3. **Session Secret**: Generate a strong random string for `SESSION_SECRET`
4. **Health Checks**: The container includes health checks at `/api/health`
5. **Restart Policy**: Docker Compose is configured with `restart: unless-stopped`

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name booklore.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Future Enhancements

Potential features to add:
- [x] Web interface for easier use
- [x] Session-based authentication for web mode
- [x] Amazon purchase links
- [ ] Amazon Affiliate integration for monetization
- [ ] Direct Amazon Product API integration (book covers, prices)
- [ ] Export recommendations to various formats
- [ ] Integration with Goodreads
- [ ] Caching to reduce API costs
- [ ] Recommendation history tracking
- [ ] Social features (share recommendations)
- [ ] Multi-user support with account management
- [ ] Recommendation feedback and learning

## Inspiration

This project is inspired by and uses similar techniques to:
- [Unearthed App](https://github.com/Unearthed-App/unearthed-app) - AI-powered book analysis and highlight syncing

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
