'use strict';

/**
 * Talk Sasa - Core Express Multi-Tenant API Routes (v1)
 * Integrates directly with Supabase PostgreSQL using tenantDbMiddleware
 */

const express = require('express');
const router = express.Router();
const { tenantDbMiddleware, verifyIngestKey, supabaseAdmin } = require('../database/supabaseClient');

// Attach tenant database client to all v1 routes
router.use(tenantDbMiddleware);

// ── 1. Database Health & Telemetry ───────────────────────────────────────────
router.get('/health', async (req, res) => {
  const start = Date.now();
  try {
    const { count: tenantCount, error: tErr } = await req.supabase
      .from('tenants')
      .select('*', { count: 'exact', head: true });

    if (tErr) throw tErr;

    const { count: contactsCount, error: cErr } = await req.supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', req.tenantId);

    const latencyMs = Date.now() - start;

    res.json({
      success: true,
      status: 'healthy',
      database: 'Supabase PostgreSQL (Multi-Tenant RLS)',
      latencyMs,
      tenantId: req.tenantId,
      metrics: {
        totalTenants: tenantCount || 1,
        tenantContacts: contactsCount || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, status: 'unhealthy', error: err.message });
  }
});

// ── 2. Contacts CRM (400,000+ Scale) ──────────────────────────────────────────
router.get('/contacts', async (req, res) => {
  try {
    const { ward, search, is_opted_out, voter_status, limit = 50, offset = 0 } = req.query;
    const result = await req.db.getContacts({
      ward,
      search,
      is_opted_out,
      voter_status,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/contacts', async (req, res) => {
  try {
    const contact = await req.db.createContact(req.body);
    res.status(201).json({ success: true, contact });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/contacts/bulk', async (req, res) => {
  try {
    const { contacts } = req.body;
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ success: false, error: 'A non-empty contacts array is required.' });
    }
    const result = await req.db.bulkImportContacts(contacts);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 3. Broadcast Campaigns ───────────────────────────────────────────────────
router.get('/campaigns', async (req, res) => {
  try {
    const { status, type, limit = 50, offset = 0 } = req.query;
    const result = await req.db.getCampaigns({
      status,
      type,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/campaigns', async (req, res) => {
  try {
    const campaign = await req.db.createCampaign(req.body);
    res.status(201).json({ success: true, campaign });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.patch('/campaigns/:id/status', async (req, res) => {
  try {
    const { status, stats } = req.body;
    const campaign = await req.db.updateCampaignStatus(req.params.id, status, stats);
    res.json({ success: true, campaign });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── 4. Live RTMP Stream Keys (Phase 5 OBS Ingest) ─────────────────────────────
router.get('/stream-keys', async (req, res) => {
  try {
    const keys = await req.db.getStreamKeys();
    res.json({ success: true, streamKeys: keys });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/stream-keys', async (req, res) => {
  try {
    const { stream_title, destinations } = req.body;
    if (!stream_title) return res.status(400).json({ success: false, error: 'stream_title is required.' });
    const stream = await req.db.createStreamKey(stream_title, destinations);
    res.status(201).json({ success: true, stream });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// OBS / Nginx-RTMP Webhook to authenticate live broadcast
router.post('/stream-keys/verify-ingest', async (req, res) => {
  try {
    const ingestKey = req.body.name || req.body.key || req.query.name;
    const result = await verifyIngestKey(ingestKey);
    if (!result.valid) {
      return res.status(403).send('Forbidden: Invalid stream key');
    }
    // Return 200 OK to RTMP server to permit broadcast
    res.status(200).json({ success: true, stream: result.stream });
  } catch (err) {
    res.status(500).send('Internal Error');
  }
});

// ── 5. Social Integrations ────────────────────────────────────────────────────
router.get('/social-integrations', async (req, res) => {
  try {
    const integrations = await req.db.getSocialIntegrations();
    res.json({ success: true, integrations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 6. Authentication & User Onboarding ───────────────────────────────────────
/**
 * POST /api/v1/auth/signup
 * Provisions auth.users and triggers automatic user_profiles creation with tenant isolation.
 */
router.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone_number, role = 'manager', tenant_id } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'email and password are required.' });
    }

    const targetTenantId = tenant_id || req.tenantId;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: first_name || '',
        last_name: last_name || '',
        phone_number: phone_number || null,
        role: role || 'manager',
        tenant_id: targetTenantId
      }
    });

    if (authError) throw authError;

    // Fetch the auto-provisioned profile created by the Postgres trigger
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    res.status(201).json({
      success: true,
      message: 'User account created and profile provisioned successfully.',
      user: authData.user,
      profile
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/auth/login (or /api/v1/auth/signin)
 * Authenticates user credentials and returns JWT bearer token + tenant profile
 */
const handleLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'email and password are required.' });
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Fetch user profile and tenant details
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    const tenantId = profile?.tenant_id || data.user.user_metadata?.tenant_id || req.tenantId;

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, name, slug, tenant_type, sender_id, county, subscription_status')
      .eq('id', tenantId)
      .single();

    res.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type
      },
      user: data.user,
      profile,
      tenant
    });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
};

router.post('/auth/login', handleLogin);
router.post('/auth/signin', handleLogin);

/**
 * GET /api/v1/auth/me
 * Returns current caller session, profile, and tenant membership
 */
router.get('/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing bearer authorization token.' });
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session token.' });
    }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const tenantId = profile?.tenant_id || user.user_metadata?.tenant_id || req.tenantId;

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    res.json({
      success: true,
      user,
      profile,
      tenant
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 7. Team & Users Management ────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const users = await req.db.getUserProfiles();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const user = await req.db.getUserProfile(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const updated = await req.db.updateUserProfile(req.params.id, req.body);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;

