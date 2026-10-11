'use strict';

/**
 * Talk Sasa — Super Admin Portal API Routes
 * Overall system management:
 * 1. Platform Master API Keys (SMS, WhatsApp, Voice, Email, Social) used by Demo accounts
 * 2. Tenant Control (List, Create, Activate, Suspend, Extend Demo, Delete)
 * 3. System-wide Telemetry & Analytics
 */

const express = require('express');
const router = express.Router();
const { supabaseAdmin, requireAuth, requireRole, auditLog } = require('../middleware/auth');
const db = require('../database/db');

// Require super_admin role for all /api/admin routes
router.use(requireAuth);
router.use(requireRole('super_admin'));

const PLATFORM_TENANT_ID = '00000000-0000-0000-0000-000000000000';

// ── 1. System Overview Metrics ────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const { data: tenants, error: tErr } = await supabaseAdmin
      .from('tenants')
      .select('id, name, slug, tenant_type, subscription_status, is_active, settings, created_at');

    if (tErr) throw tErr;

    const now = Date.now();
    let totalTenants = (tenants || []).length;
    let activeTenants = 0;
    let demoTenants = 0;
    let expiredDemos = 0;

    (tenants || []).forEach(t => {
      const isDemo = t.settings?.is_demo === true || t.subscription_status === 'trial';
      const expiresAt = t.settings?.demo_expires_at ? new Date(t.settings.demo_expires_at).getTime() : 0;
      const isExpired = isDemo && expiresAt > 0 && now > expiresAt;

      if (isDemo) {
        demoTenants++;
        if (isExpired) expiredDemos++;
      }
      if (t.is_active && !isExpired) {
        activeTenants++;
      }
    });

    // Total contacts across system
    const { count: totalContacts } = await supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact', head: true });

    // Total campaigns across system
    const { count: totalCampaigns } = await supabaseAdmin
      .from('campaigns')
      .select('*', { count: 'exact', head: true });

    // Platform master credentials status
    const platformCreds = await db.getCredentials(PLATFORM_TENANT_ID);
    const activeGateways = platformCreds.filter(c => c.is_configured || c.is_active).length;

    res.json({
      success: true,
      stats: {
        totalTenants,
        activeTenants,
        demoTenants,
        expiredDemos,
        totalContacts: totalContacts || 0,
        totalCampaigns: totalCampaigns || 0,
        platformGatewaysConfigured: activeGateways,
        totalGatewaysAvailable: platformCreds.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 2. Tenant Control ────────────────────────────────────────────────────────
router.get('/tenants', async (req, res) => {
  try {
    const { data: tenants, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const now = Date.now();

    // Enrich tenants with contact counts and demo calculation
    const enriched = await Promise.all((tenants || []).map(async (t) => {
      const { count: contactCount } = await supabaseAdmin
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', t.id);

      const { count: campaignCount } = await supabaseAdmin
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', t.id);

      const isDemo = t.settings?.is_demo === true || t.subscription_status === 'trial';
      const expiresAtStr = t.settings?.demo_expires_at || null;
      let isExpired = false;
      let daysRemaining = null;
      let hoursRemaining = null;

      if (isDemo && expiresAtStr) {
        const expiresAt = new Date(expiresAtStr).getTime();
        isExpired = now > expiresAt;
        const diffMs = Math.max(0, expiresAt - now);
        daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        hoursRemaining = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      }

      return {
        ...t,
        contact_count: contactCount || 0,
        campaign_count: campaignCount || 0,
        demo_status: {
          is_demo: isDemo,
          expires_at: expiresAtStr,
          is_expired: isExpired,
          days_remaining: daysRemaining,
          hours_remaining: hoursRemaining
        }
      };
    }));

    res.json({ success: true, tenants: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create new Tenant (Standard or 7-Day Demo)
router.post('/tenants', async (req, res) => {
  try {
    const { name, slug, county = 'Narok', is_demo = false, plan = 'standard', sender_id = 'TALKSASA' } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ success: false, error: 'name and slug are required.' });
    }

    const settings = {
      is_demo: Boolean(is_demo),
      plan: is_demo ? 'demo' : plan,
      use_platform_api_keys: Boolean(is_demo)
    };

    if (is_demo) {
      settings.demo_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      settings.trial_days = 7;
    }

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .insert([{
        name,
        slug: slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
        county,
        sender_id,
        tenant_type: 'political',
        subscription_status: is_demo ? 'trial' : 'active',
        settings,
        is_active: true
      }])
      .select()
      .single();

    if (error) throw error;

    await auditLog(tenant.id, req.userId, 'super_admin_create_tenant', 'tenant', tenant.id, { name, is_demo });
    res.status(201).json({ success: true, tenant });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update / Extend Tenant (Activate, Suspend, Extend Demo)
router.patch('/tenants/:id', async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { is_active, subscription_status, sender_id, extend_demo_days, activate_plan, name } = req.body;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ success: false, error: 'Tenant not found.' });

    const updates = {};
    const settings = { ...(existing.settings || {}) };

    if (name) updates.name = name;
    if (sender_id) updates.sender_id = sender_id;
    if (is_active !== undefined) updates.is_active = Boolean(is_active);

    // Extend 7-day demo
    if (extend_demo_days) {
      const days = parseInt(extend_demo_days, 10) || 7;
      const currentExpiry = settings.demo_expires_at ? new Date(settings.demo_expires_at).getTime() : Date.now();
      const newExpiry = new Date(Math.max(Date.now(), currentExpiry) + days * 24 * 60 * 60 * 1000);
      settings.demo_expires_at = newExpiry.toISOString();
      settings.is_demo = true;
      updates.subscription_status = 'trial';
      updates.is_active = true;
    }

    // Convert demo into full active standard plan
    if (activate_plan) {
      settings.is_demo = false;
      settings.plan = activate_plan || 'standard';
      settings.activated_at = new Date().toISOString();
      updates.subscription_status = 'active';
      updates.is_active = true;
    }

    if (subscription_status) updates.subscription_status = subscription_status;
    updates.settings = settings;
    updates.updated_at = new Date().toISOString();

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    await auditLog(tenantId, req.userId, 'super_admin_update_tenant', 'tenant', tenantId, updates);
    res.json({ success: true, tenant: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete Tenant
router.delete('/tenants/:id', async (req, res) => {
  try {
    const tenantId = req.params.id;
    if (tenantId === 'a0000000-0000-0000-0000-000000000001') {
      return res.status(400).json({ success: false, error: 'Cannot delete default anchor tenant.' });
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .delete()
      .eq('id', tenantId);

    if (error) throw error;

    await auditLog(tenantId, req.userId, 'super_admin_delete_tenant', 'tenant', tenantId);
    res.json({ success: true, message: 'Tenant successfully deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 3. Platform Master API Keys Management ────────────────────────────────────
// These master keys power all 7-Day Demo accounts and fallback dispatches
router.get('/platform-credentials', async (req, res) => {
  try {
    const creds = await db.getCredentials(PLATFORM_TENANT_ID);
    // Mask sensitive keys for safety
    const masked = creds.map(c => ({
      ...c,
      credentials: Object.fromEntries(
        Object.entries(c.credentials || {}).map(([k, v]) => [
          k,
          v && String(v).length > 4
            ? String(v).slice(0, 4) + '•'.repeat(Math.min(String(v).length - 4, 16))
            : v
        ])
      )
    }));

    res.json({
      success: true,
      data: masked,
      notice: "Platform Master API Keys automatically power all 7-Day Demo accounts for SMS, WhatsApp, Voice, and Email outreach."
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/platform-credentials/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const { credentials, is_active } = req.body;

    if (!credentials || typeof credentials !== 'object') {
      return res.status(400).json({ success: false, error: 'credentials object required.' });
    }

    const updated = await db.updateCredential(PLATFORM_TENANT_ID, service, credentials, { is_active });
    await auditLog(PLATFORM_TENANT_ID, req.userId, 'update_platform_credentials', 'api_credentials', null, { service });

    res.json({ success: true, data: updated, message: `Platform master key for "${service}" updated.` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/platform-credentials/:service/verify', async (req, res) => {
  try {
    const { service } = req.params;
    const verified = await db.verifyCredential(PLATFORM_TENANT_ID, service);
    res.json({ success: true, data: verified, message: `Platform master gateway "${service}" verified successfully.` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
