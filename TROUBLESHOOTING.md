# Troubleshooting Guide

## Common Issues and Solutions

### Web Server Issues

#### Port Already in Use

**Error**: `Error: listen EADDRINUSE: address already in use :::3000`

**Solution**:
```bash
# Option 1: Change port in .env
PORT=3001

# Option 2: Kill process using port 3000
lsof -i :3000
kill -9 <PID>
```

#### Cannot Access Web Interface

**Symptom**: Browser can't connect to http://localhost:3000

**Check**:
1. Server is running: `docker-compose ps` or check terminal output
2. Port is correct in URL (matches PORT in .env)
3. Firewall isn't blocking the port

**Solution**:
```bash
# Check if server is running
curl http://localhost:3000/api/health

# View server logs
docker-compose logs -f
# or for local: check terminal output
```

### Authentication Issues

#### "Authentication failed" Error

**Symptoms**:
- Can't get recommendations
- Error message about BookLore authentication

**Check**:
1. `.env` file exists and has correct credentials
2. BookLore username and password are correct
3. BookLore API URL is correct

**Solution**:
```bash
# Test BookLore authentication manually
curl -X POST https://api.booklore.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_USERNAME","password":"YOUR_PASSWORD"}'

# Should return: {"accessToken": "..."}
```

If manual test fails:
- Verify credentials at your BookLore instance
- Check for typos in username/password
- Ensure no extra spaces in .env file

### AI Provider Issues

#### "API key not configured"

**Symptoms**:
- Error about missing API key
- Recommendations fail to generate

**Check**:
1. `.env` has the API key for your chosen provider
2. `DEFAULT_AI_PROVIDER` matches the key you provided

**Example**:
```env
# If using Google Gemini:
DEFAULT_AI_PROVIDER=google
GOOGLE_API_KEY=your_key_here

# NOT this:
DEFAULT_AI_PROVIDER=anthropic  # ❌ Wrong - doesn't match key
GOOGLE_API_KEY=your_key_here
```

**Valid combinations**:
```env
# Option 1: Anthropic
DEFAULT_AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Option 2: OpenAI
DEFAULT_AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Option 3: Google
DEFAULT_AI_PROVIDER=google
GOOGLE_API_KEY=AI...
```

#### API Key Invalid

**Error**: 401 Unauthorized or Invalid API Key

**Solution**:
1. Verify API key is correct (no extra spaces)
2. Check API key is active in provider's dashboard
3. Ensure you have credits/quota remaining

**Test API keys**:

Anthropic:
```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":100,"messages":[{"role":"user","content":"Hi"}]}'
```

OpenAI:
```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hi"}]}'
```

Google (requires setup of API key):
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hi"}]}]}'
```

### Data Issues

#### "No reading history found"

**Symptoms**:
- Error when trying to get recommendations
- Message about no books in reading history

**Solution**:
1. Log into your BookLore account
2. Add books to your library
3. Mark books as "READ" (not just "READING" or "TO_READ")
4. Add ratings to books (1-10 scale)
5. Try again

**Note**: The system requires at least a few rated books to generate good recommendations.

#### Recommendations Don't Make Sense

**Possible causes**:
1. Not enough reading history
2. Books aren't rated
3. AI temperature too high

**Solutions**:
```env
# Lower AI temperature for more conservative recommendations
AI_TEMPERATURE=0.3

# Increase number of recommendations to get more options
MAX_RECOMMENDATIONS=10
```

### Docker Issues

#### Container Won't Start

**Check logs**:
```bash
docker-compose logs
```

**Common causes**:
1. .env file missing or misconfigured
2. Port conflict
3. Docker daemon not running

**Solutions**:
```bash
# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d

# Check Docker is running
docker info

# Check .env exists
ls -la .env
```

#### Container Keeps Restarting

**Check health**:
```bash
docker-compose ps
docker-compose logs -f
```

**Common causes**:
1. Invalid credentials causing auth failures
2. Missing environment variables
3. Application crash on startup

**Solution**:
```bash
# View detailed logs
docker-compose logs --tail=100

# Check health endpoint
curl http://localhost:3000/api/health
```

### Frontend Issues

#### Blank Page / White Screen

**Check**:
1. Browser console for JavaScript errors (F12)
2. Network tab shows 404s for CSS/JS files

**Solutions**:
```bash
# Ensure public files exist
ls -la public/

# Rebuild
npm run build

# For Docker, rebuild container
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

#### Buttons Don't Work / No Response

**Check browser console** (F12):
1. Network tab - Check if API calls are failing
2. Console tab - Check for JavaScript errors

**Common issues**:
- CORS errors: Server should handle CORS automatically
- API endpoint errors: Check server logs
- Session issues: Try clearing browser cookies

### Development Issues

#### TypeScript Compilation Errors

**Error**: Type errors during `npm run build`

**Solution**:
```bash
# Clean and reinstall
rm -rf node_modules dist
npm install
npm run build
```

#### Changes Not Reflecting

**For local development**:
```bash
# Kill existing process
# Rebuild
npm run build

# Restart
npm run web
```

**For Docker**:
```bash
# Rebuild container
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Performance Issues

#### Slow Recommendations

**Causes**:
1. Large reading history (100+ books)
2. AI provider latency
3. Network issues

**Solutions**:
```env
# Reduce number of recommendations
MAX_RECOMMENDATIONS=3

# Try faster AI provider (Google Gemini is usually fastest)
DEFAULT_AI_PROVIDER=google
```

#### High Memory Usage

**For Docker**:
```yaml
# Add to docker-compose.yml
services:
  booklore-recs:
    deploy:
      resources:
        limits:
          memory: 512M
```

### Debug Mode

Enable detailed logging:

```env
DEBUG=true
```

Then check logs:
```bash
# Docker
docker-compose logs -f

# Local
# Check terminal output
```

### Getting Help

If you're still stuck:

1. **Enable debug mode**: Set `DEBUG=true` in .env
2. **Collect logs**:
   ```bash
   docker-compose logs > logs.txt
   # or save terminal output
   ```
3. **Check configuration**:
   ```bash
   cat .env | grep -v "PASSWORD\|API_KEY"
   ```
4. **Test each component**:
   - BookLore authentication (curl test above)
   - AI provider (curl test above)
   - Health endpoint: `curl http://localhost:3000/api/health`

5. **Check the issues on GitHub** or create a new issue with:
   - Error messages
   - Relevant logs (redact sensitive info)
   - Steps to reproduce
   - Environment (Docker/local, OS, Node version)

### Quick Reset

If all else fails, complete reset:

```bash
# Stop everything
docker-compose down -v

# Clean local files
rm -rf node_modules dist

# Reinstall
npm install

# Reconfigure
cp .env.example .env
# Edit .env with your credentials

# Rebuild
npm run build

# Start fresh
docker-compose up -d

# Check logs
docker-compose logs -f
```
