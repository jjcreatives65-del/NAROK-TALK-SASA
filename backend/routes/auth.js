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
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://pqkgkfgvwlsvcwjkptoy.supabase.co';
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_z--lu40gFNcIoXWIQTwXFQ_fC7S02Km';

// Fresh client factory for user sign-in (prevents mutating supabaseAdmin singleton with user JWT)
function getAuthClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

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

    const { data, error } = await getAuthClient().auth.signInWithPassword({ email: email.trim(), password });
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
    const { data: loginData } = await getAuthClient().auth.signInWithPassword({ email: email.trim(), password });

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
    const { data: loginData } = await getAuthClient().auth.signInWithPassword({ email: demoEmail, password: demoPassword });

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

// ── 5. POST /forgot-password — Account Recovery for Super Admin & Tenant Users ──
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Email address is required.' });
    }

    const targetEmail = email.toLowerCase().trim();

    // 1. Look up user in Supabase Auth
    const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw listErr;

    const user = usersData?.users?.find(u => u.email && u.email.toLowerCase().trim() === targetEmail);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'No account registered with this email address. Please check spelling or register.'
      });
    }

    // 2. Identify Role & Tenant Context
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('*, tenants(*)')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = (profile?.role === 'super_admin') || 
                         (user.email === 'admin@naroktalksasa.ke') || 
                         (user.user_metadata?.role === 'super_admin');
    const tenantId = profile?.tenant_id || user.user_metadata?.tenant_id || 'a0000000-0000-0000-0000-000000000001';
    const tenantName = profile?.tenants?.name || (isSuperAdmin ? 'Platform Super Admin' : 'Workspace');

    // 3. Generate 6-Digit Verification Code with 15-Minute Expiry
    const recoveryCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // 4. Save Recovery Metadata in User Account
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata || {}),
        recovery_code: recoveryCode,
        recovery_expires_at: expiresAt
      }
    });

    // 5. Trigger Native Supabase Email Reset (if email provider is configured)
    try {
      await supabaseAdmin.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${req.protocol}://${req.get('host')}/#recover`
      });
    } catch (_) {}

    // 6. Record Audit Log
    await auditLog(tenantId, user.id, 'password_recovery_requested', 'auth', user.id, {
      email: targetEmail,
      is_super_admin: isSuperAdmin,
      ip: req.ip
    }, req.ip);

    res.json({
      success: true,
      message: `Verification code generated for ${isSuperAdmin ? 'Super Admin' : 'Tenant Workspace'}.`,
      is_super_admin: isSuperAdmin,
      tenant_name: tenantName,
      recovery_code: recoveryCode, // Provided for instant on-screen verification & testing
      expires_in_minutes: 15
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 6. POST /verify-code — Validate 6-Digit Recovery Code ─────────────────────
router.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, error: 'Email and verification code are required.' });
    }

    const targetEmail = email.toLowerCase().trim();
    const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw listErr;

    const user = usersData?.users?.find(u => u.email && u.email.toLowerCase().trim() === targetEmail);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    const savedCode = user.user_metadata?.recovery_code;
    const expiresAt = user.user_metadata?.recovery_expires_at;

    if (!savedCode || savedCode !== String(code).trim()) {
      return res.status(400).json({ success: false, error: 'Invalid verification code. Please check and re-enter.' });
    }

    if (!expiresAt || Date.now() > new Date(expiresAt).getTime()) {
      return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new one.' });
    }

    res.json({
      success: true,
      valid: true,
      message: 'Code verified successfully. You may now enter a new password.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 7. POST /reset-password — Set New Password & Auto-Login ───────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, new_password } = req.body;
    if (!email || !code || !new_password) {
      return res.status(400).json({ success: false, error: 'Email, verification code, and new password are required.' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const targetEmail = email.toLowerCase().trim();
    const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw listErr;

    const user = usersData?.users?.find(u => u.email && u.email.toLowerCase().trim() === targetEmail);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    const savedCode = user.user_metadata?.recovery_code;
    const expiresAt = user.user_metadata?.recovery_expires_at;

    if (!savedCode || savedCode !== String(code).trim()) {
      return res.status(400).json({ success: false, error: 'Invalid verification code.' });
    }

    if (!expiresAt || Date.now() > new Date(expiresAt).getTime()) {
      return res.status(400).json({ success: false, error: 'Verification code has expired. Request a new code.' });
    }

    // 1. Update Password & Clear Recovery Metadata
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: new_password,
      user_metadata: {
        ...(user.user_metadata || {}),
        recovery_code: null,
        recovery_expires_at: null
      }
    });

    if (updateErr) throw updateErr;

    // 2. Fetch User Profile & Tenant
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const tenantId = profile?.tenant_id || user.user_metadata?.tenant_id || 'a0000000-0000-0000-0000-000000000001';
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    const isSuperAdmin = (profile?.role === 'super_admin') || 
                         (user.email === 'admin@naroktalksasa.ke') || 
                         (user.user_metadata?.role === 'super_admin');

    await auditLog(tenantId, user.id, 'password_reset_completed', 'auth', user.id, {
      email: targetEmail,
      is_super_admin: isSuperAdmin
    }, req.ip);

    // 3. Auto-Login to Issue Fresh Session
    const { data: loginData } = await getAuthClient().auth.signInWithPassword({
      email: targetEmail,
      password: new_password
    });

    res.json({
      success: true,
      message: 'Password successfully updated! You are now securely logged in.',
      session: loginData?.session || null,
      user: {
        id: user.id,
        email: user.email,
        role: isSuperAdmin ? 'super_admin' : (profile?.role || 'owner')
      },
      profile: {
        ...(profile || {}),
        role: isSuperAdmin ? 'super_admin' : (profile?.role || 'owner')
      },
      tenant: {
        ...(tenant || { id: tenantId, name: 'Workspace' }),
        demo_status: calculateDemoStatus(tenant)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 8. POST /change-password — In-Session Password Change ───────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, error: 'Current password and new password are required.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
    }

    // Verify current password
    const { error: verifyErr } = await getAuthClient().auth.signInWithPassword({
      email: req.user.email,
      password: current_password
    });
    if (verifyErr) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
    }

    // Update password
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(req.userId, {
      password: new_password
    });
    if (updateErr) throw updateErr;

    await auditLog(req.tenantId, req.userId, 'password_changed', 'auth', req.userId, {}, req.ip);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 9. PUT /profile — Update Current User Profile ─────────────────────────────
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { first_name, last_name, phone_number, avatar_url } = req.body;
    const { data: updated, error } = await supabaseAdmin
      .from('user_profiles')
      .update({
        first_name: first_name?.trim() || null,
        last_name: last_name?.trim() || null,
        phone_number: phone_number?.trim() || null,
        avatar_url: avatar_url || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.userId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, profile: updated, message: 'Profile updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 10. GET /tenants-accessible — Tenant Switcher List for Super Admins ────────
router.get('/tenants-accessible', requireAuth, async (req, res) => {
  try {
    const isSuperAdmin = (req.role === 'super_admin') || (req.user?.email === 'admin@naroktalksasa.ke');
    if (!isSuperAdmin) {
      // Normal user can only see their own tenant
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('id, name, slug, county, subscription_status, is_active')
        .eq('id', req.tenantId)
        .single();
      return res.json({ success: true, tenants: tenant ? [tenant] : [] });
    }

    // Super admin can see all active tenants
    const { data: allTenants, error } = await supabaseAdmin
      .from('tenants')
      .select('id, name, slug, county, subscription_status, is_active, settings, created_at')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json({ success: true, tenants: allTenants || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
