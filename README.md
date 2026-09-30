# Talk Sasa — Multi-channel Grassroots Voter Outreach
> **"Getting your voice to the people"**

A comprehensive, enterprise-grade political communication platform combining **SMS, WhatsApp Business, Email Newsletters, Voice IVR**, and a **Constituents CRM** tailored for Narok County grassroots mobilization across all 30 wards.

The platform is engineered with a **fully decoupled, 3-tier modular architecture** optimized for independent development, effortless cloud hosting, and rapid mobile app compilation.

---

## 🏛️ Decoupled 3-Tier Architecture

```
NAROK TALK SASA/
│
├── 📁 backend/                       # STANDALONE NODE.JS / EXPRESS REST API
│   ├── database/                    # PostgreSQL DDL (schema.sql) & In-Memory Store (db.js, data.json)
│   ├── uploads/                     # Uploaded campaign posters, rally media, & voter contacts
│   ├── server.js                    # Express API router, CORS manager, & /health monitor
│   ├── Dockerfile & .dockerignore   # Alpine container definition for PaaS / Docker hosting
│   ├── .env.example                 # Environment configuration template
│   ├── package.json                 # Standalone backend dependencies
│   └── README.md                    # Dedicated backend deployment guide (Render, Railway, Fly.io)
│
├── 📁 frontend/                      # STANDALONE SINGLE-PAGE WEB APPLICATION
│   ├── css/                         # Pine Forest Green (#1e3f32) & Warm Gold (#ffad00) styles
│   ├── js/                          # Modular ES6 controllers & smart API routing engine (config.js)
│   ├── assets/                      # Brand assets, candidate banners, & PWA icons
│   ├── index.html                   # Command center, CRM, campaign studio, & rally scheduler UI
│   ├── vercel.json                  # 1-Click Vercel edge deployment configuration
│   ├── netlify.toml                 # 1-Click Netlify routing & redirect configuration
│   ├── nginx.conf & Dockerfile      # Production NGINX Alpine container
│   ├── package.json                 # Standalone frontend preview & dev scripts
│   └── README.md                    # Dedicated frontend deployment guide (Vercel, Netlify, Cloudflare)
│
├── 📁 android/                       # STANDALONE ANDROID CAPACITOR APP
│   ├── app/                         # Native Android Gradle module (ke.co.naroktalksasa.app)
│   │   ├── src/main/AndroidManifest.xml
│   │   ├── src/main/res/xml/network_security_config.xml # Cleartext dev & HTTPS prod security
│   │   └── src/main/assets/public/  # Synced frontend mobile assets
│   ├── gradlew & gradlew.bat        # Command-line Gradle build wrappers
│   ├── package.json                 # Mobile build & sync scripts
│   └── README.md                    # Android Studio, APK generation, & Play Store guide
│
├── 📄 docker-compose.yml             # Unified full-stack multi-container orchestration
├── 📄 capacitor.config.json          # Mobile bridge configuration linking to frontend/
├── 📄 package.json                   # Root monorepo workspace orchestration scripts
└── 📄 README.md                      # Platform manual & master deployment guide
```

---

## ⚡ Quick Start: Local Development

### Option A: Monorepo Orchestration (Easiest)
Run both backend and frontend from the workspace root:

```bash
# 1. Install root dependencies
npm install

# 2. Start the Backend API server (runs on port 3000)
npm run dev:backend

# 3. In a second terminal, start the standalone Frontend server (runs on port 5000)
npm run dev:frontend

# 4. Verify distribution builds and integrity
npm run build
```

- **Frontend Dashboard**: `http://localhost:5000` (or `http://localhost:3000` in monolithic fallback)
- **Backend API**: `http://localhost:3000`
- **Health Check**: `http://localhost:3000/health`

---

### Option B: Unified Docker Compose
Spin up the entire stack with a single command:

```bash
docker compose up --build
```
- Frontend will be accessible at: `http://localhost:80`
- Backend API will be accessible at: `http://localhost:3000`

---

## 🌐 Easy Cloud Hosting & Deployment Recipes

### 1. Backend API Deployment
Deploy the `backend/` directory to any modern container or Node.js hosting platform:

| Platform | Setup Steps |
|---|---|
| **Railway** | 1. Connect repo to [Railway.app](https://railway.app)<br>2. Set Root Directory to `backend`<br>3. Set `PORT=3000` and `CORS_ORIGIN=*`<br>4. Automatic HTTPS endpoint provided. |
| **Render** | 1. Create a new **Web Service** on [Render.com](https://render.com)<br>2. Set Root Directory: `backend`<br>3. Build Command: `npm install`<br>4. Start Command: `node server.js`<br>5. Attach a Persistent Disk to `/app/uploads` (for permanent posters). |
| **Fly.io / Cloud Run** | Run `fly launch` or `gcloud run deploy` inside the `backend/` directory using the provided [`backend/Dockerfile`](file:///c:/Users/soulh/OneDrive/Desktop/FILE%20PROJECTS/NAROK%20TALK%20SASA/backend/Dockerfile). |
| **VPS (Ubuntu + PM2)** | `cd backend && npm install --omit=dev && pm2 start server.js --name talksasa-api` |

---

### 2. Frontend Web Deployment
Deploy the `frontend/` directory as high-speed static assets to any global Edge CDN:

| Platform | Setup Steps |
|---|---|
| **Vercel** | 1. Import repository in [Vercel](https://vercel.com)<br>2. Set Root Directory: `frontend`<br>3. Zero build configuration required (uses included [`frontend/vercel.json`](file:///c:/Users/soulh/OneDrive/Desktop/FILE%20PROJECTS/NAROK%20TALK%20SASA/frontend/vercel.json)). |
| **Netlify** | 1. Connect repository in [Netlify](https://netlify.com)<br>2. Set Base directory: `frontend` and Publish directory: `frontend`<br>3. Click Deploy (uses included [`frontend/netlify.toml`](file:///c:/Users/soulh/OneDrive/Desktop/FILE%20PROJECTS/NAROK%20TALK%20SASA/frontend/netlify.toml)). |
| **Cloudflare Pages** | Connect repo, set build output directory to `frontend`, and deploy globally on Cloudflare's Edge. |
| **AWS S3 + CloudFront** | Sync `frontend/` to an S3 bucket configured for static web hosting. |

---

### 3. Android Mobile App Compilation

#### A. Syncing Updates to Android
Whenever you modify frontend HTML/CSS/JS, sync the assets to the Android bundle:
```bash
npm run sync:android
```

#### B. Building a Standalone Debug APK (Without Android Studio)
```bash
npm run build:apk
```
The compiled debug APK will be generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

#### C. Opening in Android Studio
1. Launch **Android Studio**.
2. Open the [`android/`](file:///c:/Users/soulh/OneDrive/Desktop/FILE%20PROJECTS/NAROK%20TALK%20SASA/android) directory.
3. Plug in an Android device with USB debugging enabled or launch the emulator.
4. Press **Run (▶)** to install and launch directly on the device.

---

## 📡 Dynamic API Server Configuration

The frontend includes an intelligent **API Client Engine** ([`frontend/js/config.js`](file:///c:/Users/soulh/OneDrive/Desktop/FILE%20PROJECTS/NAROK%20TALK%20SASA/frontend/js/config.js)):
- **Smart Endpoint Auto-Detection**:
  - Automatically routes to `http://localhost:3000` during local dev.
  - Automatically routes to `http://10.0.2.2:3000` inside the Android emulator.
  - Transparently intercepts all `fetch('/api/...')` calls without modifying core scripts.
- **In-App API Server Switcher**:
  - Click the **"API Server"** button in the header bar of the app at any time to inspect server connection status, run a live health check, or configure a custom production backend URL!

---

## 🗄️ Database Architecture & DDL Schema

Located at [`backend/database/schema.sql`](file:///c:/Users/soulh/OneDrive/Desktop/FILE%20PROJECTS/NAROK%20TALK%20SASA/backend/database/schema.sql):

```sql
-- Constituents (Contacts) Table
CREATE TABLE constituents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    national_id VARCHAR(20) UNIQUE,
    county VARCHAR(50) DEFAULT 'Narok',
    ward VARCHAR(50),
    polling_station VARCHAR(100),
    is_opted_out BOOLEAN DEFAULT FALSE,
    voter_status VARCHAR(30) DEFAULT 'registered',
    preferred_channel VARCHAR(20) DEFAULT 'sms',
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_constituents_ward ON constituents(ward);
CREATE INDEX idx_constituents_phone ON constituents(phone_number);
CREATE INDEX idx_constituents_optout ON constituents(is_opted_out);
```

---

## 🔒 Security & Data Protection Compliance

- **Kenya Data Protection Act 2019**: Built-in opt-out management (`is_opted_out`), voter consent enforcement, and audit logs.
- **Android Network Security**: Explicit [`network_security_config.xml`](file:///c:/Users/soulh/OneDrive/Desktop/FILE%20PROJECTS/NAROK%20TALK%20SASA/android/app/src/main/res/xml/network_security_config.xml) guarding communication over local IP ranges during development and enforcing TLS 1.3 in production.
- **CORS Protection**: Dynamic origin filtering via `CORS_ORIGIN` environment variable.
