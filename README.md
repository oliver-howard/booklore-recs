# BookLore AI Book Recommendations

An AI-powered book recommendation system that uses your reading history and ratings from BookLore to provide personalized book suggestions. This system LLMs to analyze your reading patterns and suggest books you'll love.

## Features

- **Multiple Recommendation Types:**
  - **Similar Books**: Get recommendations based on books you've enjoyed
  - **Contrasting Perspectives**: Discover books that challenge your current viewpoints
  - **Blind Spots Analysis**: Identify gaps in your reading and get suggestions to broaden your horizons
  - **Custom Recommendations**: Specify your own criteria for personalized suggestions

- **Multi-LLM Support:**
  - Anthropic Claude (default)
  - OpenAI ChatGPT
  - Google Gemini

- **Reading Statistics**: View your reading patterns, favorite genres, and top authors

## Installation

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

4. Edit `.env` with your credentials:
```env
# BookLore API Configuration
BOOKLORE_API_URL=https://your.booklore-url.com/api/v1
BOOKLORE_USERNAME=your_username
BOOKLORE_PASSWORD=your_password

# AI Provider Configuration (choose one)
ANTHROPIC_API_KEY=your_anthropic_key
# or
OPENAI_API_KEY=your_openai_key
# or
GOOGLE_API_KEY=your_google_key

# Default AI Provider
DEFAULT_AI_PROVIDER=anthropic
```

5. Build the project:
```bash
npm run build
```

## Usage

### Basic Commands

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

### AI Provider Comparison

| Provider | Model | Strengths | Cost |
|----------|-------|-----------|------|
| **Anthropic Claude** | claude-3-5-sonnet-20241022 | Best reasoning, detailed analysis | $$$ |
| **OpenAI ChatGPT** | gpt-4-turbo-preview | Strong general knowledge | $$$ |
| **Google Gemini** | gemini-pro | Good value, fast | $$ |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BOOKLORE_API_URL` | BookLore API base URL | `https://ebooks.fiosa.us/api/v1` |
| `BOOKLORE_USERNAME` | Your BookLore username | Required |
| `BOOKLORE_PASSWORD` | Your BookLore password | Required |
| `DEFAULT_AI_PROVIDER` | AI provider to use | `anthropic` |
| `ANTHROPIC_API_KEY` | Anthropic API key | Required if using Claude |
| `OPENAI_API_KEY` | OpenAI API key | Required if using ChatGPT |
| `GOOGLE_API_KEY` | Google API key | Required if using Gemini |
| `AI_TEMPERATURE` | Creativity level (0.0-1.0) | `0.7` |
| `MAX_RECOMMENDATIONS` | Number of recommendations | `5` |

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

2. "Recursion" by Blake Crouch
   Given your high rating of "Dark Matter," you'll appreciate Crouch's exploration
   of another mind-bending scientific concept with emotional depth and thriller pacing.
```

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
│   ├── config.ts                   # Configuration management
│   ├── types.ts                    # TypeScript type definitions
│   ├── booklore-client.ts          # BookLore API client
│   ├── ai-service.ts               # Multi-LLM AI service
│   └── recommendation-service.ts   # Main recommendation logic
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
- Verify BookLore credentials in `.env`
- Check if the API URL is correct
- Ensure your account is active

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

## Future Enhancements

Potential features to add:
- [ ] Web interface for easier use
- [ ] Export recommendations to various formats
- [ ] Integration with Goodreads
- [ ] Caching to reduce API costs
- [ ] Batch processing for multiple users
- [ ] Recommendation history tracking
- [ ] Social features (share recommendations)

## Inspiration

This project is inspired by and uses similar techniques to:
- [Unearthed App](https://github.com/Unearthed-App/unearthed-app) - AI-powered book analysis and recommendations

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
