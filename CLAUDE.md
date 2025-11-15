# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered book recommendation system that integrates with BookLore API and uses LLMs (Anthropic Claude, OpenAI ChatGPT, or Google Gemini) to provide personalized book recommendations. Built using a **direct prompting approach** (no embeddings or vector databases) inspired by the Unearthed app.

## Build & Development

```bash
# Install dependencies
npm install

# Build TypeScript to dist/
npm run build

# Development mode (no build required)
npm run dev [command]

# Production mode
npm run recommend [command]
```

## Core Architecture

### Three-Layer Design

1. **BookLoreClient** (`src/booklore-client.ts`)
   - Authenticates with BookLore API using JWT tokens (`accessToken` field in response)
   - Fetches user's reading history from `/books` endpoint (not `/user/readings`)
   - Transforms BookLore API response to internal `UserReading` type
   - **Important**: BookLore returns ALL books; must filter by `readStatus === 'READ'`

2. **AIService** (`src/ai-service.ts`)
   - Multi-provider abstraction for Anthropic/OpenAI/Google
   - Formats reading history as text context (not embeddings)
   - Sends structured prompts with system message + user data
   - Cleans AI responses (removes markdown, special characters) before JSON parsing
   - **Critical**: Uses temperature 0.7 for balanced creativity

3. **RecommendationService** (`src/recommendation-service.ts`)
   - Orchestrates BookLoreClient + AIService
   - Implements four recommendation types: similar, contrasting, blindspots, custom
   - Entry point for CLI commands

### Data Flow

```
CLI (index.ts)
  → RecommendationService.getRecommendations()
    → BookLoreClient.getUserReadingHistory()
      → Fetch /books → Filter readStatus=READ → Transform to UserReading[]
    → AIService.getSimilarRecommendations()
      → Format readings as text with ratings
      → Send to LLM with structured prompt
      → Parse JSON response
  → Format and display results
```

## Critical Implementation Details

### BookLore API Integration

**Authentication:**
- Endpoint: `POST /auth/login` with `{username, password}`
- Response field: `accessToken` (not `token`)
- Authorization: `Bearer {accessToken}` header

**Reading History:**
- Endpoint: `GET /books` (returns entire library, not just read books)
- **Must filter**: `book.readStatus === 'READ'`
- Data mapping:
  ```typescript
  title: book.metadata?.title || book.fileName
  author: book.metadata?.authors?.[0]
  rating: book.metadata?.personalRating  // 10-point scale
  genres: book.metadata?.categories || book.metadata?.moods
  ```

### Rating System

**BookLore uses 10-point ratings (1-10), not 5-point**

When formatting for AI:
```typescript
entry += ` (Rating: ${rating}/10)`;  // NOT /5
```

When displaying stats:
```typescript
console.log(`Average rating: ${avg.toFixed(2)}/10`);  // NOT /5
```

### AI Provider Configuration

**Default models (as of 2025):**
- Anthropic: `claude-3-5-sonnet-20241022`
- OpenAI: `gpt-4o` (NOT `gpt-4-turbo-preview` - deprecated)
- Google: `gemini-2.5-flash` (NOT `gemini-pro` or `gemini-1.5-*` - retired)

**Switching providers:** Update `DEFAULT_AI_PROVIDER` in `.env`

### Prompt Engineering Approach

Uses **direct prompting** (no RAG/embeddings):

1. Format user's reading history as plain text with context:
   - Title, author, rating (out of 10)
   - Genres/moods
   - **Notes** (user's thoughts on the book - critical context)
   - Reviews (longer-form feedback)
2. Send to LLM with role-based system message
3. Request structured JSON response
4. Clean and parse response

**Why this works:**
- LLMs already trained on vast book knowledge
- User ratings provide personalization signal
- **Notes reveal WHY users liked/disliked books** - most valuable context
- Reviews add additional preference details
- Simpler than vector DB approach for personal use
- More flexible for custom recommendation types

**Context format example:**
```
"Project Hail Mary" by Andy Weir (Rating: 10/10) [Sci-Fi, Adventurous]
  Notes: Love the humor and hard science. Rocky is the best character.
  Review: Amazing blend of problem-solving and wit...
```

## Common Tasks

### Adding a New Recommendation Type

1. Add type to `RecommendationType` in `src/types.ts`
2. Implement method in `AIService` (e.g., `getNewTypeRecommendations()`)
3. Add case to `RecommendationService.getRecommendations()` switch
4. Add CLI command case in `src/index.ts`

### Debugging BookLore API Issues

Set `DEBUG=true` in `.env` to enable detailed logging in `BookLoreClient`:
```typescript
this.log(`Fetching books from: ${url}`);
this.log(`Response status: ${response.status}`);
```

### Testing with Different AI Providers

No need to rebuild - just change `.env`:
```bash
DEFAULT_AI_PROVIDER=google  # or anthropic, openai
```

Then run: `npm run recommend similar`

### Updating AI Models

Models are configured in `src/config.ts`. Update defaults when models change:
- Check provider docs for current model names
- Update `config.ai.{provider}.model` default value
- Update `.env.example` comments

## Environment Configuration

Required in `.env`:
- `BOOKLORE_USERNAME` / `BOOKLORE_PASSWORD` - BookLore credentials
- One of: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY`
- `DEFAULT_AI_PROVIDER` - which AI to use

Optional:
- `DEBUG=true` - enable API logging
- `AI_TEMPERATURE` - LLM creativity (0.0-1.0, default 0.7)
- `MAX_RECOMMENDATIONS` - number to return (default 5)

## Project Structure

```
src/
├── index.ts                    # CLI entry point
├── config.ts                   # Environment config & validation
├── types.ts                    # TypeScript types & Zod schemas
├── booklore-client.ts          # BookLore API integration
├── ai-service.ts               # Multi-provider LLM abstraction
└── recommendation-service.ts   # Business logic orchestration
```

## Key Design Decisions

1. **Direct prompting over embeddings** - Simpler, leverages LLM's book knowledge
2. **Multi-provider support** - Flexibility for users (free Gemini vs paid Claude)
3. **10-point rating scale** - Matches BookLore's system
4. **TypeScript with Zod** - Runtime validation for API responses
5. **ESM modules** - Modern JavaScript module system
6. **No database** - Stateless, fetches fresh data each run
