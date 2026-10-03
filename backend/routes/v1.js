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

module.exports = router;
