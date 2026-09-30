# Narok Talk Sasa - Frontend Web Application

Decoupled, high-performance political outreach dashboard and Grassroots Command Center built with responsive HTML5, modern CSS3 (Pine Forest Green, Marigold Gold, Warm Cream Canvas), and modular ES6 JavaScript.

---

## 📁 Architecture Overview

- **Stack**: Pure Vanilla HTML5 / CSS3 / ES6 (Zero bulky build dependencies required)
- **Design Tokens**: Pine Forest Green (`#1e3f32`), Marigold Gold (`#ffad00`), Light Cream (`#fdfbf7`) & Sleek Dark Mode
- **Features**:
  - Constituents CRM with 30 Narok Wards filtering and search
  - Excel Voter Database Ingestion (`.xlsx`, `.xls`, `.csv`)
  - Omnichannel Broadcast Studio (SMS, WhatsApp Business, Voice IVR, Email)
  - CAK Alphanumeric Sender ID Management
  - Rallies & Mobilization Event Scheduler with customizable posters
  - Real-time Telemetry Dashboard
  - PostgreSQL Schema Visualizer & Interactive SQL Playground
  - Cross-platform Android Capacitor integration & PWA Service Worker

---

## ⚡ Connecting to the Backend API

The frontend includes an intelligent **API Routing Engine** (`js/config.js`):

1. **Automatic Detection**:
   - In dev, defaults to `http://localhost:3000`.
   - In production same-origin hosting, uses relative `/api/...`.
   - On Android Capacitor, defaults to `http://10.0.2.2:3000` (emulator) or configured server URL.
2. **In-App Configuration**:
   - Click the **"API Server"** button in the top navigation bar to configure or test your backend endpoint live!
   - Saves your custom backend URL in `localStorage` across page reloads.

---

## 🚀 Local Development

```bash
# Start lightweight local server on port 5000
npm start
# Or using npx directly:
npx -y serve -l 5000 .
```

Open `http://localhost:5000` in your browser.

---

## 🌐 Easy Cloud Deployment & Hosting

### Option 1: Vercel (1-Click Deploy)
1. Push this `frontend/` folder (or full monorepo) to GitHub.
2. Sign in to [Vercel](https://vercel.com).
3. Import your repository:
   - If importing full repo, set **Root Directory** to `frontend`.
   - **Framework Preset**: Other
   - **Build Command**: (leave empty)
   - **Output Directory**: (leave empty or `.`)
4. Click **Deploy**. Vercel will immediately serve your app globally via its Edge CDN using the included `vercel.json` configuration.

---

### Option 2: Netlify
1. Sign in to [Netlify](https://netlify.com).
2. Choose **"Import an existing project"** from GitHub.
3. Set:
   - **Base directory**: `frontend`
   - **Publish directory**: `frontend` (or `.`)
4. Click **Deploy Site**. Netlify automatically applies the provided `netlify.toml` routing rules.

---

### Option 3: Cloudflare Pages
1. Sign in to [Cloudflare Dashboard](https://dash.cloudflare.com) -> **Workers & Pages**.
2. Click **Create Application** -> **Pages** -> **Connect to Git**.
3. Select your repository:
   - **Build output directory**: `frontend`
4. Click **Save and Deploy**.

---

### Option 4: Docker / NGINX Container
```bash
# Build production NGINX container
docker build -t narok-talk-sasa-frontend .

# Run container on port 80
docker run -d -p 80:80 --name talksasa-web narok-talk-sasa-frontend
```

Visit `http://localhost`.

---

### Option 5: AWS S3 + CloudFront or GitHub Pages
Because the frontend consists of static assets, simply upload all files in `frontend/` to:
- An Amazon S3 bucket configured for Static Website Hosting.
- A GitHub repository branch with GitHub Pages enabled.
