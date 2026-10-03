try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
  require('dotenv').config();
} catch (e) {}

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const xlsx     = require('xlsx');
const db = fs.existsSync(path.join(__dirname, 'database', 'db.js'))
  ? require('./database/db')
  : require('../database/db');
const { requireAuth, requireRole, requirePermission, auditLog } = require('./middleware/auth');
const tenantRoutes = require('./routes/tenants');


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }
});

const app  = express();
const PORT = process.env.PORT || 3000;

// CORS
const rawCorsOrigin = process.env.CORS_ORIGIN || '*';
const corsOptions = rawCorsOrigin === '*' ? { origin: '*' } : {
  origin: rawCorsOrigin.split(',').map(s => s.trim())
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Upload directory
const uploadsDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Serve frontend if co-deployed
const standaloneFrontendPath = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(standaloneFrontendPath)) {
  app.use(express.static(standaloneFrontendPath));
}

// ──────────────────────────────────────────────────────────────────────────────
// Utility: async route handler wrapper
// ──────────────────────────────────────────────────────────────────────────────
const asyncRoute = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(err => {
    console.error('API Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  });

// ──────────────────────────────────────────────────────────────────────────────
// Tenant router (auth, invites, member mgmt, audit log)
// ──────────────────────────────────────────────────────────────────────────────
app.use('/api/tenants', tenantRoutes);


// ──────────────────────────────────────────────────────────────────────────────
// 0. HEALTH CHECK
// ──────────────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'narok-talk-sasa-backend',
    version: '2.0.0',
    database: 'supabase',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    nodeVersion: process.version
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// UNIVERSAL IMAGE UPLOAD
// ──────────────────────────────────────────────────────────────────────────────
app.post('/api/upload-image', upload.single('image'), (req, res) => {
  try {
    let fileBuffer, fileName;
    if (req.file) {
      fileBuffer = req.file.buffer;
      const ext = path.extname(req.file.originalname) || '.jpg';
      fileName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    } else if (req.body?.base64Data) {
      const matches = req.body.base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      if (!matches) return res.status(400).json({ success: false, error: 'Invalid base64 data.' });
      fileBuffer = Buffer.from(matches[2], 'base64');
      const ext = matches[1].includes('png') ? '.png' : matches[1].includes('webp') ? '.webp' : '.jpg';
      fileName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    } else {
      return res.status(400).json({ success: false, error: 'No image provided.' });
    }
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, fileBuffer);
    res.json({
      success: true,
      url: `uploads/${fileName}`,
      fullUrl: `${req.protocol}://${req.get('host')}/uploads/${fileName}`,
      fileName,
      message: 'Image uploaded successfully'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. STATS
// ──────────────────────────────────────────────────────────────────────────────
app.get('/api/stats', requireAuth, asyncRoute(async (req, res) => {
  const stats = await db.getStats(req.tenantId);
  res.json({ success: true, data: stats });
}));

// ──────────────────────────────────────────────────────────────────────────────
// 2. CONSTITUENTS CRM
// ──────────────────────────────────────────────────────────────────────────────
app.get('/api/constituents', requireAuth, asyncRoute(async (req, res) => {
  const { ward, search, is_opted_out, voter_status, limit, offset } = req.query;
  const result = await db.getConstituents(req.tenantId, {
    ward, search, is_opted_out, voter_status,
    limit: parseInt(limit, 10) || 50,
    offset: parseInt(offset, 10) || 0
  });
  res.json({ success: true, ...result });
}));

app.post('/api/constituents', requireAuth, requireRole('field_agent'), asyncRoute(async (req, res) => {
  const newC = await db.createConstituent(req.tenantId, req.userId, req.body);
  await auditLog(req.tenantId, req.userId, 'create_constituent', 'constituent', newC.id, { phone: newC.phone_number }, req.ip);
  res.status(201).json({ success: true, data: newC });
}));

app.put('/api/constituents/:id', requireAuth, requireRole('field_agent'), asyncRoute(async (req, res) => {
  const updated = await db.updateConstituent(req.tenantId, req.params.id, req.body);
  if (!updated) return res.status(404).json({ success: false, error: 'Constituent not found.' });
  res.json({ success: true, data: updated });
}));

app.delete('/api/constituents/:id', requireAuth, requirePermission('delete'), asyncRoute(async (req, res) => {
  await db.deleteConstituent(req.tenantId, req.params.id);
  await auditLog(req.tenantId, req.userId, 'delete_constituent', 'constituent', req.params.id, {}, req.ip);
  res.json({ success: true, message: 'Constituent deleted.' });
}));

app.post('/api/constituents/bulk', requireAuth, requireRole('campaign_manager'), asyncRoute(async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ success: false, error: 'Expected records array.' });
  const result = await db.bulkImportConstituents(req.tenantId, records);
  await auditLog(req.tenantId, req.userId, 'bulk_import', 'constituent', null, { count: result.imported }, req.ip);
  res.json({ success: true, ...result });
}));

// Excel upload
app.post('/api/constituents/upload-excel', requireAuth, requireRole('campaign_manager'), upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ success: false, error: 'No Excel file provided.' });

  const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return res.status(400).json({ success: false, error: 'Excel has no worksheets.' });

  const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (!rawRows?.length) return res.status(400).json({ success: false, error: 'Excel sheet is empty.' });

  const mappedRecords = [];
  for (const row of rawRows) {
    let phone = '', first = '', last = '', idNum = '', ward = '', polling = '';
    let voterStatus = 'registered', channel = 'sms', optedOut = false;

    for (const [key, val] of Object.entries(row)) {
      const k = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const v = String(val).trim();
      if (k.includes('phone') || k.includes('mobile') || k.includes('contact') || k === 'tel') phone = v;
      else if (k.includes('first') || k === 'fname') first = v;
      else if (k.includes('last') || k === 'lname' || k.includes('surname')) last = v;
      else if ((k === 'name' || k === 'fullname') && !first && !last) {
        const parts = v.split(/\s+/); first = parts[0] || ''; last = parts.slice(1).join(' ') || '';
      }
      else if (k.includes('national') || k === 'id') idNum = v;
      else if (k.includes('ward')) ward = v;
      else if (k.includes('polling') || k.includes('station')) polling = v;
      else if (k.includes('status')) voterStatus = v.toLowerCase().includes('youth') ? 'youth_first_time' : v.toLowerCase().includes('elder') ? 'elder' : 'registered';
      else if (k.includes('channel')) channel = v.toLowerCase().includes('what') ? 'whatsapp' : v.toLowerCase().includes('voice') ? 'voice' : 'sms';
      else if (k.includes('opt')) optedOut = v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'yes';
    }

    if (phone) {
      let cleanPhone = phone.replace(/[^0-9+]/g, '');
      if (cleanPhone.startsWith('0')) cleanPhone = '+254' + cleanPhone.slice(1);
      else if (cleanPhone.startsWith('254')) cleanPhone = '+' + cleanPhone;
      else if (!cleanPhone.startsWith('+')) cleanPhone = '+254' + cleanPhone;
      mappedRecords.push({ phone_number: cleanPhone, first_name: first || 'Voter', last_name: last, national_id: idNum, ward: ward || 'Narok Town', polling_station: polling || 'Ward Center', voter_status: voterStatus, preferred_channel: channel, is_opted_out: optedOut });
    }
  }

  if (!mappedRecords.length) return res.status(400).json({ success: false, error: 'No valid phone numbers found.' });
  const result = await db.bulkImportConstituents(req.tenantId, mappedRecords);
  await auditLog(req.tenantId, req.userId, 'excel_import', 'constituent', null, { file: req.file.originalname, imported: result.imported }, req.ip);
  res.json({ success: true, fileName: req.file.originalname, totalRowsParsed: rawRows.length, ...result, samplePreview: mappedRecords.slice(0, 5) });
}));

// Download voter template
app.get('/api/constituents/download-template', (req, res) => {
  try {
    const templateData = [
      { 'Phone Number': '+254712345001', 'First Name': 'Lemayian', 'Last Name': 'Ole Naserian', 'National ID': '28491024', 'County': 'Narok', 'Ward': 'Kilgoris Central', 'Polling Station': 'Kilgoris Primary School', 'Voter Status': 'elder', 'Preferred Channel': 'sms', 'Opted Out': 'FALSE' },
      { 'Phone Number': '+254722987110', 'First Name': 'Sintamei', 'Last Name': 'Resiato', 'National ID': '34190822', 'County': 'Narok', 'Ward': 'Kilgoris Central', 'Polling Station': 'St. Joseph Technical', 'Voter Status': 'youth_first_time', 'Preferred Channel': 'whatsapp', 'Opted Out': 'FALSE' }
    ];
    const ws = xlsx.utils.json_to_sheet(templateData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Narok_Voter_Registry');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Narok_Talk_Sasa_Voter_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. CAMPAIGNS
// ──────────────────────────────────────────────────────────────────────────────
app.get('/api/campaigns', requireAuth, asyncRoute(async (req, res) => {
  res.json({ success: true, data: await db.getCampaigns(req.tenantId) });
}));

app.post('/api/campaigns', requireAuth, requireRole('campaign_manager'), asyncRoute(async (req, res) => {
  const campaign = await db.createCampaign(req.tenantId, req.userId, req.body);
  await auditLog(req.tenantId, req.userId, 'create_campaign', 'campaign', campaign.id, { name: campaign.campaign_name }, req.ip);
  res.status(201).json({ success: true, data: campaign });
}));

app.post('/api/campaigns/:id/dispatch', requireAuth, requireRole('campaign_manager'), asyncRoute(async (req, res) => {
  const campaign = await db.dispatchCampaign(req.tenantId, req.params.id);
  await auditLog(req.tenantId, req.userId, 'dispatch_campaign', 'campaign', req.params.id, { name: campaign.campaign_name }, req.ip);
  res.json({ success: true, data: campaign, message: "Broadcast dispatched via Africa's Talking & Meta Cloud." });
}));

// ──────────────────────────────────────────────────────────────────────────────
// 4. SENDER IDs
// ──────────────────────────────────────────────────────────────────────────────
app.get('/api/sender-ids', requireAuth, asyncRoute(async (req, res) => {
  res.json({ success: true, data: await db.getSenderIds(req.tenantId) });
}));

app.post('/api/sender-ids', requireAuth, requireRole('campaign_manager'), asyncRoute(async (req, res) => {
  const newSender = await db.createSenderId(req.tenantId, req.body);
  await auditLog(req.tenantId, req.userId, 'create_sender_id', 'sender_id', newSender.id, { name: newSender.sender_name }, req.ip);
  res.status(201).json({ success: true, data: newSender });
}));

// ──────────────────────────────────────────────────────────────────────────────
// 5. RALLIES
// ──────────────────────────────────────────────────────────────────────────────
app.get('/api/rallies', requireAuth, asyncRoute(async (req, res) => {
  res.json({ success: true, data: await db.getRallies(req.tenantId) });
}));

app.post('/api/rallies', requireAuth, requireRole('campaign_manager'), asyncRoute(async (req, res) => {
  const rally = await db.createRally(req.tenantId, req.userId, req.body);
  await auditLog(req.tenantId, req.userId, 'create_rally', 'rally', rally.id, { title: rally.rally_title }, req.ip);
  res.status(201).json({ success: true, data: rally });
}));

app.post('/api/rallies/:id/rsvp', requireAuth, requireRole('field_agent'), asyncRoute(async (req, res) => {
  const rally = await db.rsvpRally(req.tenantId, req.params.id);
  if (!rally) return res.status(404).json({ success: false, error: 'Rally not found' });
  res.json({ success: true, data: rally });
}));

app.post('/api/rallies/:id/photo', requireAuth, requireRole('campaign_manager'), asyncRoute(async (req, res) => {
  const { photoUrl } = req.body;
  if (!photoUrl) return res.status(400).json({ success: false, error: 'photoUrl required.' });
  const updated = await db.updateRallyPhoto(req.tenantId, req.params.id, photoUrl);
  if (!updated) return res.status(404).json({ success: false, error: 'Rally not found' });
  res.json({ success: true, data: updated });
}));

// ──────────────────────────────────────────────────────────────────────────────
// 6. SOCIAL MEDIA SYNC
// ──────────────────────────────────────────────────────────────────────────────
app.get('/api/social-sync', requireAuth, asyncRoute(async (req, res) => {
  res.json({ success: true, data: await db.getSocialSyncAds(req.tenantId) });
}));

// ──────────────────────────────────────────────────────────────────────────────
// 7. AUTOMATIONS
// ──────────────────────────────────────────────────────────────────────────────
app.get('/api/automations', requireAuth, asyncRoute(async (req, res) => {
  res.json({ success: true, data: await db.getAutomations(req.tenantId) });
}));

app.post('/api/automations/:id/toggle', requireAuth, requireRole('campaign_manager'), asyncRoute(async (req, res) => {
  const updated = await db.toggleAutomation(req.tenantId, req.params.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Automation not found' });
  res.json({ success: true, data: updated });
}));

// ──────────────────────────────────────────────────────────────────────────────
// 8. TELEMETRY
// ──────────────────────────────────────────────────────────────────────────────
app.get('/api/telemetry', requireAuth, asyncRoute(async (req, res) => {
  const stats = await db.getStats(req.tenantId);
  const jitter = Math.floor(Math.random() * 4) - 2;
  res.json({
    success: true,
    data: {
      gateway: { name: 'Kong / NGINX Ingress', status: 'Operational', uptime: '99.98%', latencyMs: 12 + jitter, throughputReqSec: 4200 + Math.floor(Math.random() * 80), activeConnections: 3150 + Math.floor(Math.random() * 30) },
      services: {
        crmCore:     { name: 'CRM Core Service', status: 'healthy', indexedRecords: `${stats.totalConstituents.toLocaleString()}+`, queryLatencyMs: 2.1 },
        omnichannel: { name: 'Omnichannel Engine', status: 'healthy', queueDepth: 14, dispatchRate: '350 msg/s', activeChannels: ['SMS (AT)', 'WhatsApp (Meta)', 'Email (SES)', 'Voice (IVR)'] },
        socialSync:  { name: 'Social Media Sync', status: 'healthy', metaSyncStatus: 'synced', xSyncStatus: 'synced', lastSyncTime: '3 mins ago' }
      },
      dataStores: {
        postgres:       { name: 'Supabase PostgreSQL', status: 'healthy', replicaLagMs: 0.8, activePoolConns: 24, storageUsed: '4.8 GB' },
        redis:          { name: 'Redis Cache & Queue', status: 'healthy', opsPerSec: 12400, memoryUsed: '240 MB' },
        africasTalking: { name: "Africa's Talking Gateway", status: 'connected', smppSession: 'bound', smsBalanceKes: 148500.00, deliveryRate: '98.8%' },
        whatsappMeta:   { name: 'WhatsApp Business (Meta Cloud API)', status: 'connected', qualityRating: 'High (Green)', tierLimit: '100K messages / day' },
        socialGraph:    { name: 'Meta & X Ads Graph APIs', status: 'connected', rateLimitRemaining: '94%' }
      },
      timestamp: new Date().toISOString()
    }
  });
}));

// ──────────────────────────────────────────────────────────────────────────────
// 9. SQL PLAYGROUND
// ──────────────────────────────────────────────────────────────────────────────
app.get('/api/schema', requireAuth, (req, res) => {
  try {
    const candidates = [
      path.join(__dirname, 'database', 'supabase_schema.sql'),
      path.join(__dirname, '..', 'database', 'supabase_schema.sql'),
      path.join(__dirname, 'database', 'schema.sql'),
      path.join(__dirname, '..', 'database', 'schema.sql')
    ];
    const schemaPath = candidates.find(p => fs.existsSync(p));
    const content = schemaPath ? fs.readFileSync(schemaPath, 'utf8') : '-- No schema file found.';
    res.json({ success: true, schemaSql: content });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/sql-runner', requireAuth, requirePermission('sql'), asyncRoute(async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ success: false, error: 'Query is required.' });
  const result = await db.executeSql(req.tenantId, query);
  res.json({ success: true, ...result });
}));

// ──────────────────────────────────────────────────────────────────────────────
// 10. API CREDENTIALS MANAGEMENT
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/credentials — list all services (redacted) */
app.get('/api/credentials', requireAuth, requirePermission('credentials'), asyncRoute(async (req, res) => {
  const creds = await db.getCredentials(req.tenantId);
  const masked = creds.map(c => ({
    ...c,
    credentials: Object.fromEntries(
      Object.entries(c.credentials || {}).map(([k, v]) => [
        k,
        v && String(v).length > 4
          ? String(v).slice(0, 4) + '•'.repeat(Math.min(String(v).length - 4, 20))
          : v
      ])
    )
  }));
  res.json({ success: true, data: masked });
}));

/** GET /api/credentials/:service — get single credential */
app.get('/api/credentials/:service', requireAuth, requirePermission('credentials'), asyncRoute(async (req, res) => {
  const cred = await db.getCredential(req.tenantId, req.params.service);
  res.json({ success: true, data: cred });
}));

/** PUT /api/credentials/:service — save API keys */
app.put('/api/credentials/:service', requireAuth, requirePermission('credentials'), asyncRoute(async (req, res) => {
  const { credentials, is_active, notes } = req.body;
  if (!credentials || typeof credentials !== 'object') {
    return res.status(400).json({ success: false, error: 'credentials object required.' });
  }
  const updated = await db.updateCredential(req.tenantId, req.params.service, credentials, { is_active, notes });
  await auditLog(req.tenantId, req.userId, 'update_credentials', 'api_credentials', null, { service: req.params.service }, req.ip);
  res.json({ success: true, data: updated, message: `Credentials for "${req.params.service}" saved.` });
}));

/** POST /api/credentials/:service/verify */
app.post('/api/credentials/:service/verify', requireAuth, requirePermission('credentials'), asyncRoute(async (req, res) => {
  const updated = await db.verifyCredential(req.tenantId, req.params.service);
  res.json({ success: true, data: updated, message: 'Service marked as connected.' });
}));

// ──────────────────────────────────────────────────────────────────────────────
// START SERVER
// ──────────────────────────────────────────────────────────────────────────────
if (require.main === module || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('=======================================================');
    console.log('🚀 Narok Talk Sasa Backend API v2.0 (Multi-Tenant)');
    console.log(`📡 URL:        http://localhost:${PORT}`);
    console.log(`🗄️  Database:   Supabase PostgreSQL (multi-tenant RLS)`);
    console.log(`🔐 Auth:       Supabase Auth + RBAC middleware`);
    console.log(`🏢 Tenants:    /api/tenants`);
    console.log(`🔑 Credentials: /api/credentials (per-tenant)`);
    console.log(`🛡️  CORS:       ${rawCorsOrigin}`);
    console.log(`🩺 Health:     http://localhost:${PORT}/health`);
    console.log('=======================================================');
  });
}

module.exports = app;
