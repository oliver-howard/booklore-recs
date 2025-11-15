# BookLore Recommendations - Deployment Guide

This guide covers deploying the BookLore Recommendations web application as a self-hosted container.

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- BookLore account with username and password
- API key for at least one AI provider (Anthropic, OpenAI, or Google)

### 1. Clone and Configure

```bash
# Clone the repository
git clone <your-repo-url>
cd booklore_recs

# Create environment file
cp .env.example .env
```

### 2. Edit Configuration

Open `.env` and configure:

```env
# BookLore credentials
BOOKLORE_API_URL=https://api.booklore.app
BOOKLORE_USERNAME=your_booklore_username
BOOKLORE_PASSWORD=your_booklore_password

# Choose and configure ONE AI provider
DEFAULT_AI_PROVIDER=google  # or anthropic, openai

# Add your API key for the chosen provider
GOOGLE_API_KEY=your_google_api_key_here
# OR
ANTHROPIC_API_KEY=your_anthropic_key_here
# OR
OPENAI_API_KEY=your_openai_key_here

# Web server settings
PORT=3000
SESSION_SECRET=$(openssl rand -base64 32)  # Generate random secret
```

### 3. Start the Application

```bash
# Build and start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f
```

### 4. Access the Application

Open your browser to: **http://localhost:3000**

### 5. Stop the Application

```bash
docker-compose down
```

## Production Deployment

### Security Considerations

1. **Generate Strong Session Secret**
   ```bash
   # Generate a random session secret
   openssl rand -base64 32
   ```
   Add this to your `.env` as `SESSION_SECRET`

2. **Use HTTPS**
   - Deploy behind a reverse proxy (Nginx, Traefik, Caddy)
   - Configure SSL/TLS certificates (Let's Encrypt recommended)

3. **Secure Environment Variables**
   - Never commit `.env` to version control
   - Use Docker secrets or environment variable injection in production
   - Restrict file permissions: `chmod 600 .env`

### Reverse Proxy Setup

#### Using Nginx

1. Install Nginx:
   ```bash
   sudo apt update
   sudo apt install nginx certbot python3-certbot-nginx
   ```

2. Create Nginx config `/etc/nginx/sites-available/booklore`:
   ```nginx
   server {
       listen 80;
       server_name booklore.yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. Enable and get SSL certificate:
   ```bash
   sudo ln -s /etc/nginx/sites-available/booklore /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   sudo certbot --nginx -d booklore.yourdomain.com
   ```

#### Using Caddy (Easier)

Create `Caddyfile`:
```caddy
booklore.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Run Caddy:
```bash
caddy run
```

### Docker Compose Production Configuration

For production, modify `docker-compose.yml`:

```yaml
version: '3.8'

services:
  booklore-recs:
    build: .
    container_name: booklore-recommendations
    ports:
      - "127.0.0.1:3000:3000"  # Only bind to localhost
    env_file:
      - .env
    restart: always  # Always restart on failure
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Systemd Service (Alternative to Docker Compose)

Create `/etc/systemd/system/booklore-recs.service`:

```ini
[Unit]
Description=BookLore Recommendations
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/booklore_recs
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable booklore-recs
sudo systemctl start booklore-recs
sudo systemctl status booklore-recs
```

## Monitoring

### View Container Logs

```bash
# Follow logs
docker-compose logs -f

# Last 100 lines
docker-compose logs --tail=100

# Logs from last hour
docker-compose logs --since 1h
```

### Health Checks

```bash
# Check container health
docker-compose ps

# Check health endpoint
curl http://localhost:3000/api/health
```

### Restart Container

```bash
docker-compose restart
```

## Updating the Application

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Verify
docker-compose logs -f
```

## Backup and Restore

### Backup Configuration

```bash
# Backup .env file
cp .env .env.backup

# Or create encrypted backup
tar czf - .env | gpg -c > booklore-env-backup.tar.gz.gpg
```

### Restore

```bash
# Restore from backup
gpg -d booklore-env-backup.tar.gz.gpg | tar xz
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs

# Check if port is already in use
sudo lsof -i :3000

# Remove and rebuild
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Authentication Errors

```bash
# Verify credentials in .env
cat .env | grep BOOKLORE

# Test manually with curl
curl -X POST https://api.booklore.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"your_username","password":"your_password"}'
```

### AI Provider Errors

```bash
# Check which provider is configured
cat .env | grep DEFAULT_AI_PROVIDER

# Verify API key is set
cat .env | grep API_KEY
```

### High Memory Usage

```bash
# Check container stats
docker stats booklore-recommendations

# Set memory limits in docker-compose.yml
services:
  booklore-recs:
    deploy:
      resources:
        limits:
          memory: 512M
```

## Performance Optimization

### Caching

Add caching headers in Nginx:

```nginx
location /api/ {
    proxy_pass http://localhost:3000;
    # Add caching for static API responses
    proxy_cache_valid 200 5m;
}
```

### Resource Limits

Set resource limits in `docker-compose.yml`:

```yaml
services:
  booklore-recs:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          memory: 256M
```

## Multi-User Deployment

For multiple users, you'll need to implement authentication. Consider:

1. Add user authentication (OAuth, JWT)
2. Store user sessions in Redis
3. Implement per-user BookLore credentials
4. Add rate limiting

## Support

For issues and questions:
- Check the main README.md
- Review logs: `docker-compose logs -f`
- Check health endpoint: `curl http://localhost:3000/api/health`
