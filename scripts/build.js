const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

console.log('=======================================================');
console.log('🔨 BUILDING TALK SASA PLATFORM (PRODUCTION BUILD)');
console.log('📦 DECOUPLED ARCHITECTURE: Backend + Frontend + Android');
console.log('=======================================================');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// 1. Syntax & Integrity Checks across Decoupled Services
console.log('\n[Phase 1/4] Checking JavaScript Syntax & Integrity...');
const jsFilesToCheck = [
  'backend/server.js',
  'backend/database/db.js',
  'frontend/js/config.js',
  'frontend/js/app.js',
  'frontend/js/crm.js',
  'frontend/js/excel-import.js',
  'frontend/js/campaigns.js',
  'frontend/js/senders.js',
  'frontend/js/rallies.js',
  'frontend/js/telemetry.js',
  'frontend/js/schema-viewer.js'
];

let jsOk = true;
for (const relPath of jsFilesToCheck) {
  const fullPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`  ❌ Missing required script: ${relPath}`);
    jsOk = false;
    continue;
  }
  try {
    const code = fs.readFileSync(fullPath, 'utf8');
    new vm.Script(code, { filename: relPath });
    const sizeKb = (Buffer.byteLength(code, 'utf8') / 1024).toFixed(1);
    console.log(`  ✓ ${relPath} (${sizeKb} KB) - Valid Syntax`);
  } catch (err) {
    console.error(`  ❌ Syntax error in ${relPath}: ${err.message}`);
    jsOk = false;
  }
}
if (!jsOk) {
  console.error('\nBuild aborted due to JavaScript syntax errors.');
  process.exit(1);
}

// 2. CSS Stylesheet & Brand Asset Verification
console.log('\n[Phase 2/4] Verifying Stylesheets & Brand Palette Tokens...');
const cssFiles = [
  'frontend/css/main.css',
  'frontend/css/components.css',
  'frontend/css/architecture.css'
];

for (const relPath of cssFiles) {
  const fullPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`  ❌ Missing stylesheet: ${relPath}`);
    process.exit(1);
  }
  const css = fs.readFileSync(fullPath, 'utf8');
  // Check balanced braces
  const openCount = (css.match(/\{/g) || []).length;
  const closeCount = (css.match(/\}/g) || []).length;
  if (openCount !== closeCount) {
    console.error(`  ❌ Mismatched braces in ${relPath} (${openCount} { vs ${closeCount} })`);
    process.exit(1);
  }
  const sizeKb = (Buffer.byteLength(css, 'utf8') / 1024).toFixed(1);
  console.log(`  ✓ ${relPath} (${sizeKb} KB) - Valid CSS Structure`);
}

// Check database schema
console.log('\n[Phase 3/4] Validating PostgreSQL DDL Schema...');
const schemaPath = path.join(ROOT_DIR, 'backend/database/schema.sql');
if (fs.existsSync(schemaPath)) {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const requiredTables = ['constituents', 'campaigns', 'rally_events', 'sender_ids', 'social_sync_ads', 'campaign_dispatches'];
  for (const tbl of requiredTables) {
    if (sql.includes(`CREATE TABLE ${tbl}`) || sql.includes(`CREATE TABLE IF NOT EXISTS ${tbl}`)) {
      console.log(`  ✓ Table defined: ${tbl}`);
    } else {
      console.warn(`  ⚠️ Warning: Table ${tbl} not explicitly declared in schema.sql`);
    }
  }
  if (sql.includes('idx_constituents_ward')) {
    console.log('  ✓ Performance Index defined: idx_constituents_ward');
  }
} else {
  console.error('  ❌ Missing backend/database/schema.sql');
  process.exit(1);
}

// 4. Packaging Production Distributions (dist/)
console.log('\n[Phase 4/4] Generating Production Distributions (dist/)...');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Clean and recreate dist
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// Copy standalone backend
const distBackend = path.join(DIST_DIR, 'backend');
copyRecursiveSync(path.join(ROOT_DIR, 'backend'), distBackend);
console.log('  ✓ Packaged dist/backend (Standalone Node.js Express API)');

// Copy standalone frontend
const distFrontend = path.join(DIST_DIR, 'frontend');
copyRecursiveSync(path.join(ROOT_DIR, 'frontend'), distFrontend);
console.log('  ✓ Packaged dist/frontend (Standalone Static Web Application)');

// Compute asset inventory and SHA-256 hashes
const manifest = {
  name: 'narok-talk-sasa',
  motto: 'Getting your voice to the people',
  architecture: 'Decoupled 3-Tier (Backend API, Frontend Web, Android Capacitor)',
  brand_palette: {
    hero_dark_gradient: ['#1e3f32', '#142a22', '#0d1d17'],
    accent_gold: ['#ffad00', '#ffd066', '#d49000'],
    canvas_light: ['#fdfbf7', '#ffffff', '#f4f0e6']
  },
  build_timestamp: new Date().toISOString(),
  environment: 'production',
  assets: []
};

function scanDir(dir, base = '') {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    const rel = path.join(base, file).replace(/\\/g, '/');
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      scanDir(full, rel);
    } else {
      const data = fs.readFileSync(full);
      const hash = crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
      manifest.assets.push({
        file: rel,
        size_bytes: stat.size,
        hash
      });
    }
  }
}

scanDir(DIST_DIR);
fs.writeFileSync(path.join(DIST_DIR, 'build-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`  ✓ Generated dist/build-manifest.json (${manifest.assets.length} artifacts tracked)`);

console.log('\n=======================================================');
console.log('✨ BUILD SUCCESSFUL! Production distributions ready:');
console.log('   - Backend API:  dist/backend/');
console.log('   - Frontend Web: dist/frontend/');
console.log('   - Android App:  android/');
console.log('=======================================================');
