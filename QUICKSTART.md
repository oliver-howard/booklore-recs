# Quick Start Guide

Get your AI book recommendations running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit the `.env` file with your credentials:

```env
# BookLore credentials
BOOKLORE_USERNAME=your_username
BOOKLORE_PASSWORD=your_password

# Choose ONE AI provider and add its API key:

# Option 1: Anthropic Claude (recommended)
ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_AI_PROVIDER=anthropic

# Option 2: OpenAI ChatGPT
# OPENAI_API_KEY=sk-...
# DEFAULT_AI_PROVIDER=openai

# Option 3: Google Gemini
# GOOGLE_API_KEY=...
# DEFAULT_AI_PROVIDER=google
```

## Step 3: Build the Project

```bash
npm run build
```

## Step 4: Get Recommendations!

```bash
# Get similar book recommendations
npm run recommend similar

# Get contrasting perspectives
npm run recommend contrasting

# Analyze your reading blind spots
npm run recommend blindspots

# View your reading stats
npm run recommend stats
```

## Getting API Keys

### Anthropic Claude (Recommended)
1. Go to https://console.anthropic.com/
2. Sign up for an account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key to your `.env` file

### OpenAI ChatGPT
1. Go to https://platform.openai.com/
2. Sign up for an account
3. Navigate to API Keys
4. Create a new API key
5. Copy the key to your `.env` file

### Google Gemini
1. Go to https://makersuite.google.com/app/apikey
2. Sign in with Google
3. Create an API key
4. Copy the key to your `.env` file

## Troubleshooting

### "Authentication failed"
- Double-check your BookLore username and password in `.env`
- Verify you can log in at https://ebooks.fiosa.us/

### "API key not configured"
- Make sure you've set the API key for your chosen provider
- Check that `DEFAULT_AI_PROVIDER` matches your provider (anthropic, openai, or google)

### "No reading history found"
- You need to have read and rated some books in BookLore first
- Log in to BookLore and add some books to your reading history

## Example Output

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

## Next Steps

- Try different recommendation types: similar, contrasting, blindspots
- Use custom recommendations: `npm run recommend custom "science fiction with AI"`
- Read the full [README.md](README.md) for advanced usage

## Need Help?

Check the full documentation in [README.md](README.md) or open an issue on GitHub.
