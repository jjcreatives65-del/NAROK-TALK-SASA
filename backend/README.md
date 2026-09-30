# Narok Talk Sasa - Backend API Service

Dedicated Node.js & Express REST API server providing voter CRM segmentation, Africa's Talking SMS, Meta WhatsApp Business dispatch, Voice IVR routing, rally scheduling, and telemetry metrics for the Narok County Grassroots Outreach Platform.

---

## 📁 Architecture Overview

- **Runtime**: Node.js 18+ / 20+
- **Framework**: Express 5.x
- **Persistence**: In-Memory indexing engine backed by PostgreSQL DDL (`database/schema.sql`) and JSON snapshots (`database/data.json`)
- **Media Engine**: Multer multipart & base64 photo processing (`uploads/`)
- **Integration Interfaces**:
  - SMS & Voice: Africa's Talking SMPP Gateway
  - WhatsApp: Meta Cloud API v20.0
  - Ads Sync: Meta Graph API & X Ads API

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port on which the API server listens |
| `NODE_ENV` | `development` | Environment mode (`development` / `production`) |
| `CORS_ORIGIN` | `*` | Allowed CORS origins (e.g. `https://my-frontend.vercel.app,capacitor://localhost`) |
| `UPLOAD_DIR` | `./uploads` | Directory for uploaded campaign posters and voter files |
| `DATA_FILE` | `./database/data.json` | Path to persistent database snapshot |

---

## 🚀 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run with hot reload (Node.js 18+)
npm run dev

# 3. Or standard start
npm start
```

- API Base: `http://localhost:3000`
- Health Check: `http://localhost:3000/health`
- Schema Viewer: `http://localhost:3000/api/schema`

---

## 🌐 Easy Cloud Deployment & Hosting

### Option 1: Railway (Recommended - 2 Minutes)
1. Push this `backend/` folder (or full repo) to GitHub.
2. Sign in to [Railway.app](https://railway.app).
3. Click **"New Project"** -> **"Deploy from GitHub repo"**.
4. Set root directory to `/backend` (if using monorepo).
5. Add environment variables:
   - `PORT=3000`
   - `CORS_ORIGIN=*` (or your frontend domain)
6. Railway automatically detects `server.js` and provides an HTTPS URL like `https://narok-talk-sasa-api.up.railway.app`.

---

### Option 2: Render.com
1. Sign in to [Render.com](https://render.com).
2. Click **"New"** -> **"Web Service"**.
3. Select your repository.
4. Set:
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. Under **Advanced** -> Add persistent disk (mount path `/app/uploads`) if you want permanent image uploads.
6. Click **Deploy**.

---

### Option 3: Docker / Container Platforms (Cloud Run, Fly.io, AWS ECS, DigitalOcean)
```bash
# Build Docker image
docker build -t narok-talk-sasa-backend .

# Run container
docker run -d -p 3000:3000 \
  -e PORT=3000 \
  -e CORS_ORIGIN="*" \
  -v $(pwd)/uploads:/app/uploads \
  --name talksasa-api narok-talk-sasa-backend
```

---

### Option 4: Linux VPS (Ubuntu / Debian + PM2 + NGINX)
```bash
# 1. Clone & install
cd /var/www/narok-talk-sasa/backend
npm install --omit=dev

# 2. Start with PM2 Process Manager
npm install -g pm2
pm2 start server.js --name "talksasa-api"
pm2 save
pm2 startup

# 3. NGINX Reverse Proxy snippet (/etc/nginx/sites-available/api):
# server {
#     server_name api.talksasa.ke;
#     location / {
#         proxy_pass http://localhost:3000;
#         proxy_http_version 1.1;
#         proxy_set_header Upgrade $http_upgrade;
#         proxy_set_header Connection 'upgrade';
#         proxy_set_header Host $host;
#         proxy_cache_bypass $http_upgrade;
#     }
# }
```

---

## 🧪 Verifying Deployment

```bash
curl https://YOUR-API-HOST/health
```

Expected JSON response:
```json
{
  "status": "healthy",
  "service": "narok-talk-sasa-backend",
  "version": "1.0.0",
  "uptime": 124.5,
  "timestamp": "2026-09-30T11:00:00.000Z",
  "nodeVersion": "v20.x"
}
```
