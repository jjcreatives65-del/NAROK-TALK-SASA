'use strict';

/**
 * Talk Sasa — Authentication & Tenant Onboarding API Routes
 * Supports:
 * 1. Standard Login & JWT session issuance
 * 2. Regular Organization Signup (Isolated Tenant)
 * 3. 1-Click 7-Day Free Demo Trial Onboarding (Platform API Keys pre-activated)
 * 4. Current session introspection (/me) with Demo Expiry tracking
 */

const express = require('express');
const router = express.Router();
const { supabaseAdmin, requireAuth, auditLog } = require('../middleware/auth');
const crypto = require('crypto');

// Helper to calculate demo countdown
function calculateDemoStatus(tenant) {
  if (!tenant) return { is_demo: false };
  const isDemo = tenant.settings?.is_demo === true || tenant.subscription_status === 'trial';
  if (!isDemo) return { is_demo: false };

  const now = Date.now();
  const expiresAtStr = tenant.settings?.demo_expires_at || new Date(new Date(tenant.created_at || now).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const expiresAt = new Date(expiresAtStr).getTime();
  const isExpired = now > expiresAt;
  const diffMs = Math.max(0, expiresAt - now);
  const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  return {
    is_demo: true,
    expires_at: expiresAtStr,
    is_expired: isExpired,
    days_remaining: daysRemaining,
    hours_remaining: hoursRemaining,
    use_platform_api_keys: Boolean(tenant.settings?.use_platform_api_keys ?? true)
  };
}

// ── 1. POST /login — Standard Authentication ──────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      return res.status(401).json({ success: false, error: error.message });
    }

    // Fetch user profile
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    // Determine target tenant ID
    const tenantId = profile?.tenant_id || data.user.user_metadata?.tenant_id || 'a0000000-0000-0000-0000-000000000001';

    // Fetch tenant details
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    const isSuperAdmin = (profile?.role === 'super_admin') || (data.user.email === 'admin@naroktalksasa.ke') || (data.user.user_metadata?.role === 'super_admin');
    const demoStatus = calculateDemoStatus(tenant);

    res.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type
      },
      user: {
        id: data.user.id,
        email: data.user.email,
        role: isSuperAdmin ? 'super_admin' : (profile?.role || 'tenant_admin')
      },
      profile: {
        ...(profile || {}),
        role: isSuperAdmin ? 'super_admin' : (profile?.role || 'tenant_admin')
      },
      tenant: {
        ...(tenant || { id: tenantId, name: 'Default Tenant', slug: 'default' }),
        demo_status: demoStatus
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 2. POST /signup — Standard Organization Registration ──────────────────────
router.post('/signup', async (req, res) => {
  try {
    const {
      email,
      password,
      first_name = '',
      last_name = '',
      phone_number = '',
      organization_name,
      county = 'Narok'
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const orgName = organization_name || `${first_name || 'Campaign'} Organization`;
    const slugBase = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const uniqueSlug = `${slugBase}-${crypto.randomBytes(3).toString('hex')}`;

    // 1. Create Tenant
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .insert([{
        name: orgName,
        slug: uniqueSlug,
        county,
        sender_id: 'TALKSASA',
        tenant_type: 'political',
        subscription_status: 'active',
        settings: { plan: 'standard', is_demo: false },
        is_active: true
      }])
      .select()
      .single();

    if (tenantErr) throw tenantErr;

    // 2. Create Auth User linked to Tenant
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: {
        first_name,
        last_name,
        phone_number,
        role: 'owner',
        tenant_id: tenant.id
      }
    });

    if (authErr) throw authErr;

    // 3. Upsert User Profile
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: authData.user.id,
        tenant_id: tenant.id,
        first_name,
        last_name,
        role: 'owner',
        phone_number,
        is_active: true
      })
      .select()
      .single();

    // Auto sign in to return session
    const { data: loginData } = await supabaseAdmin.auth.signInWithPassword({ email: email.trim(), password });

    res.status(201).json({
      success: true,
      message: 'Organization created successfully.',
      session: loginData?.session || null,
      user: authData.user,
      profile,
      tenant: {
        ...tenant,
        demo_status: { is_demo: false }
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── 3. POST /demo — 1-Click 7-Day Demo Instant Setup ───────────────────────────
router.post('/demo', async (req, res) => {
  try {
    const {
      organization_name,
      candidate_name,
      email,
      phone_number,
      county = 'Narok'
    } = req.body;

    const orgTitle = organization_name || (candidate_name ? `${candidate_name} Campaign 2027 (Demo)` : 'Narok Grassroots Outreach (7-Day Demo)');
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    const demoEmail = email && email.trim() ? email.trim() : `demo_${Date.now()}_${randomSuffix}@naroktalksasa.ke`;
    const demoPassword = `DemoPass!${randomSuffix}2027`;
    const slug = `demo-${orgTitle.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')}-${randomSuffix}`.slice(0, 50);

    const demoExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Create Demo Tenant with 7-Day Expiry & Platform Master API Keys enabled
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from('tenants')
      .insert([{
        name: orgTitle,
        slug,
        county,
        sender_id: 'TALKSASA',
        tenant_type: 'political',
        subscription_status: 'trial',
        settings: {
          is_demo: true,
          plan: 'demo',
          demo_expires_at: demoExpiresAt,
          trial_days: 7,
          use_platform_api_keys: true
        },
        is_active: true
      }])
      .select()
      .single();

    if (tErr) throw tErr;

    // 2. Create User with 'manager' role (valid PostgreSQL user_role enum)
    const nameParts = (candidate_name || 'Demo Candidate').split(' ');
    const firstName = nameParts[0] || 'Demo';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    const { data: authData, error: aErr } = await supabaseAdmin.auth.admin.createUser({
      email: demoEmail,
      password: demoPassword,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        phone_number: phone_number || '+254700000000',
        role: 'manager',
        tenant_id: tenant.id
      }
    });

    if (aErr) throw aErr;

    // 3. Upsert User Profile
    await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: authData.user.id,
        tenant_id: tenant.id,
        first_name: firstName,
        last_name: lastName,
        role: 'manager',
        phone_number: phone_number || '+254700000000',
        is_active: true
      });

    // 4. Seed 5 Starter Contacts for instant Demo testing
    const starterContacts = [
      { first_name: 'Ole', last_name: 'Ntutu', phone_number: '+254711100201', ward: 'Narok Town', polling_station: 'Narok High School', voter_status: 'registered' },
      { first_name: 'Naisula', last_name: 'Lesuuda', phone_number: '+254722100202', ward: 'Kilgoris Central', polling_station: 'Kilgoris Primary', voter_status: 'registered' },
      { first_name: 'Kiprono', last_name: 'Kemei', phone_number: '+254733100203', ward: 'Ololulungá', polling_station: 'Ololulunga Center', voter_status: 'registered' },
      { first_name: 'Sanau', last_name: 'Saitoti', phone_number: '+254744100204', ward: 'Mara', polling_station: 'Sekenani Gate', voter_status: 'registered' },
      { first_name: 'Stephen', last_name: 'Kudate', phone_number: '+254755100205', ward: 'Suswa', polling_station: 'Suswa Junction', voter_status: 'registered' }
    ].map(c => ({ ...c, tenant_id: tenant.id, county: 'Narok', preferred_channel: 'sms', is_opted_out: false }));

    await supabaseAdmin.from('contacts').insert(starterContacts).then(() => {}).catch(() => {});

    // Sign in to get access token
    const { data: loginData } = await supabaseAdmin.auth.signInWithPassword({ email: demoEmail, password: demoPassword });

    const demoStatus = calculateDemoStatus(tenant);

    res.status(201).json({
      success: true,
      message: '7-Day Full-Access Demo Workspace created successfully!',
      session: loginData?.session || null,
      credentials: {
        email: demoEmail,
        password: demoPassword
      },
      user: {
        id: authData.user.id,
        email: demoEmail,
        role: 'campaign_manager'
      },
      profile: {
        id: authData.user.id,
        first_name: firstName,
        last_name: lastName,
        role: 'campaign_manager',
        tenant_id: tenant.id
      },
      tenant: {
        ...tenant,
        demo_status: demoStatus
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 4. GET /me — Current Session Introspection ────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', req.userId)
      .single();

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', req.tenantId)
      .single();

    const isSuperAdmin = (req.role === 'super_admin') || (req.user?.email === 'admin@naroktalksasa.ke');
    const demoStatus = calculateDemoStatus(tenant);

    res.json({
      success: true,
      user: {
        id: req.userId,
        email: req.user?.email,
        role: isSuperAdmin ? 'super_admin' : (req.role || 'tenant_admin')
      },
      profile: {
        ...(profile || {}),
        role: isSuperAdmin ? 'super_admin' : (req.role || 'tenant_admin')
      },
      tenant: {
        ...(tenant || { id: req.tenantId, name: 'Active Workspace' }),
        demo_status: demoStatus
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
