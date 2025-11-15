# Quick Start Guide - Web App

Get your self-hosted BookLore recommendations web app running in 3 minutes!

## 🚀 Docker Quick Start (Recommended)

### Step 1: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your AI provider configuration:

```env
# AI Provider (choose ONE)
DEFAULT_AI_PROVIDER=google
GOOGLE_API_KEY=your_google_key
# OR ANTHROPIC_API_KEY=your_anthropic_key
# OR OPENAI_API_KEY=your_openai_key

# Web server
PORT=3000
SESSION_SECRET=change-to-random-string

# BookLore API URL (default is fine for most users)
BOOKLORE_API_URL=https://api.booklore.app
```

**Note**: You no longer need to put your BookLore username/password in `.env`! You'll log in through the web interface.

### Step 2: Start Container

```bash
docker-compose up -d
```

### Step 3: Open Browser & Login

1. Visit: **http://localhost:3000**
2. You'll see a login page
3. Enter your BookLore username and password
4. Click "Login"

That's it! 🎉 Your credentials are stored securely in your browser session.

---

## 💻 Local Development (No Docker)

### Step 1: Install & Configure

```bash
npm install
cp .env.example .env
# Edit .env as shown above
```

### Step 2: Start Web Server

```bash
npm run web
```

### Step 3: Open Browser

Visit: **http://localhost:3000**

---

## 🎯 Using the Web Interface

1. **Statistics Tab**: View your reading history stats
2. **Similar Books**: Get recommendations like books you loved
3. **Contrasting**: Discover challenging perspectives
4. **Blind Spots**: Find gaps in your reading patterns
5. **Custom**: Enter your own search criteria

---

## 🔧 CLI Mode (Optional)

You can also use the command line:

```bash
# Similar recommendations
npm run recommend similar

# Contrasting perspectives
npm run recommend contrasting

# Analyze blind spots
npm run recommend blindspots

# View stats
npm run recommend stats

# Custom search
npm run recommend custom "science fiction with AI"
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

---

## 🛠️ Docker Commands

```bash
# View logs
docker-compose logs -f

# Stop container
docker-compose down

# Restart
docker-compose restart

# Rebuild after code changes
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## ⚠️ Troubleshooting

### Container won't start
```bash
docker-compose logs
```

### Port already in use
Change `PORT=3001` in `.env`

### Authentication fails
- Verify BookLore credentials in `.env`
- Check BOOKLORE_API_URL is correct

### AI provider errors
- Ensure DEFAULT_AI_PROVIDER matches your API key
- Verify API key is valid

### No reading history
- Add and rate books in your BookLore account first

---

## 📚 More Information

- **Full Guide**: [README.md](README.md)
- **Deployment**: [DEPLOYMENT.md](DEPLOYMENT.md) for production setup
- **Architecture**: [CLAUDE.md](CLAUDE.md) for technical details

---

## 🔒 Security Tips

- Never commit `.env` to git
- Generate random SESSION_SECRET: `openssl rand -base64 32`
- Use HTTPS in production (see [DEPLOYMENT.md](DEPLOYMENT.md))
