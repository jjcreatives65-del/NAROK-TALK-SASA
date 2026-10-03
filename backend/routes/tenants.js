'use strict';
/**
 * Narok Talk Sasa — Tenant, User & Invitation API Routes
 */

const express = require('express');
const router  = express.Router();
const { supabaseAdmin, requireAuth, requireRole, auditLog } = require('../middleware/auth');

// ── GET /api/tenants/me — current user's tenant info ────────────────────────
router.get('/me', requireAuth, async (req, res) => {
    try {
        const { data: tenant, error } = await supabaseAdmin
            .from('tenants')
            .select('*')
            .eq('id', req.tenantId)
            .single();

        if (error || !tenant) return res.status(404).json({ success: false, error: 'Tenant not found.' });

        const { data: membership } = await supabaseAdmin
            .from('tenant_memberships')
            .select('role, is_active, last_seen_at, created_at')
            .eq('user_id', req.userId)
            .eq('tenant_id', req.tenantId)
            .single();

        res.json({ success: true, data: { tenant, membership } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── GET /api/tenants — list all tenants (super_admin only) ──────────────────
router.get('/', requireAuth, requireRole('super_admin'), async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('tenants')
            .select('*, tenant_memberships(count)')
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── POST /api/tenants — create a new tenant (super_admin only) ───────────────
router.post('/', requireAuth, requireRole('super_admin'), async (req, res) => {
    try {
        const { name, slug, county, plan, logo_url } = req.body;
        if (!name || !slug) return res.status(400).json({ success: false, error: 'name and slug required.' });

        const { data: tenant, error } = await supabaseAdmin
            .from('tenants')
            .insert([{ name, slug, county: county || 'Narok', plan: plan || 'standard', logo_url }])
            .select().single();
        if (error) throw error;

        // Seed empty credential slots for the new tenant
        const credSlots = [
            { service_name: 'africas_talking_sms',   display_name: "Africa's Talking SMS",         category: 'sms',      icon: '📱', credentials: { username:'', api_key:'', sender_id:'', shortcode:'' } },
            { service_name: 'africas_talking_voice',  display_name: "Africa's Talking Voice / IVR", category: 'voice',    icon: '📞', credentials: { username:'', api_key:'', caller_id:'' } },
            { service_name: 'africas_talking_ussd',   display_name: "Africa's Talking USSD",        category: 'ussd',     icon: '🔢', credentials: { username:'', api_key:'', service_code:'' } },
            { service_name: 'meta_whatsapp',           display_name: 'WhatsApp Business (Meta)',     category: 'whatsapp', icon: '💬', credentials: { phone_number_id:'', access_token:'', business_account_id:'', app_id:'', verify_token:'' } },
            { service_name: 'meta_facebook_ads',       display_name: 'Meta Facebook Ads',           category: 'social',   icon: '📘', credentials: { app_id:'', app_secret:'', access_token:'', ad_account_id:'', pixel_id:'' } },
            { service_name: 'x_twitter_ads',           display_name: 'X (Twitter) Ads API',         category: 'social',   icon: '🐦', credentials: { api_key:'', api_secret:'', access_token:'', access_token_secret:'', ad_account_id:'' } },
            { service_name: 'sendgrid_email',          display_name: 'SendGrid Email',              category: 'email',    icon: '📧', credentials: { api_key:'', from_email:'', from_name:'' } }
        ].map(s => ({ ...s, tenant_id: tenant.id }));

        await supabaseAdmin.from('api_credentials').insert(credSlots);

        await auditLog(tenant.id, req.userId, 'create_tenant', 'tenant', tenant.id, { name, slug });
        res.status(201).json({ success: true, data: tenant });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── PATCH /api/tenants/:id — update tenant settings ──────────────────────────
router.patch('/:id', requireAuth, requireRole('tenant_admin'), async (req, res) => {
    try {
        const tenantId = req.params.id;
        // Tenant admin can only update their own tenant
        if (req.role !== 'super_admin' && tenantId !== req.tenantId) {
            return res.status(403).json({ success: false, error: 'Cannot update another tenant.' });
        }
        const allowed = ['name', 'logo_url', 'county', 'settings'];
        const updates = {};
        for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

        const { data, error } = await supabaseAdmin.from('tenants').update(updates).eq('id', tenantId).select().single();
        if (error) throw error;
        await auditLog(tenantId, req.userId, 'update_tenant', 'tenant', tenantId, updates);
        res.json({ success: true, data });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

router.get('/members', requireAuth, requireRole('tenant_admin'), async (req, res) => {
    try {
        const { data: members, error } = await supabaseAdmin
            .from('tenant_memberships')
            .select('*')
            .eq('tenant_id', req.tenantId)
            .order('created_at', { ascending: false });
        if (error) throw error;

        const userIds = (members || []).map(m => m.user_id).filter(Boolean);
        let profileMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await supabaseAdmin
                .from('profiles')
                .select('id, full_name, phone_number, avatar_url')
                .in('id', userIds);
            (profiles || []).forEach(p => { profileMap[p.id] = p; });
        }

        const combined = (members || []).map(m => ({
            ...m,
            profile: profileMap[m.user_id] || null
        }));

        res.json({ success: true, data: combined });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── PATCH /api/tenants/members/:userId — update a member's role ──────────────
router.patch('/members/:userId', requireAuth, requireRole('tenant_admin'), async (req, res) => {
    try {
        const { role, is_active } = req.body;
        const updates = {};
        if (role)       updates.role      = role;
        if (is_active !== undefined) updates.is_active = is_active;

        const { data, error } = await supabaseAdmin
            .from('tenant_memberships')
            .update(updates)
            .eq('user_id', req.params.userId)
            .eq('tenant_id', req.tenantId)
            .select().single();
        if (error) throw error;
        await auditLog(req.tenantId, req.userId, 'update_member_role', 'user', req.params.userId, { role, is_active });
        res.json({ success: true, data });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── POST /api/tenants/invite — invite user by email ──────────────────────────
router.post('/invite', requireAuth, requireRole('tenant_admin'), async (req, res) => {
    try {
        const { email, role } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'email required.' });

        const { data: invite, error } = await supabaseAdmin
            .from('invitations')
            .insert([{
                tenant_id:  req.tenantId,
                email:      email.toLowerCase().trim(),
                role:       role || 'field_agent',
                invited_by: req.userId
            }])
            .select().single();
        if (error) throw error;

        // In production: send invite email via SendGrid here
        // For now return the token so it can be shared manually
        await auditLog(req.tenantId, req.userId, 'invite_user', 'invitation', invite.id, { email, role });
        res.status(201).json({
            success: true,
            data: invite,
            message: `Invitation created for ${email}. Share the token or integrate email delivery.`,
            inviteUrl: `${process.env.FRONTEND_URL || 'http://localhost:5000'}/accept-invite?token=${invite.token}`
        });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── POST /api/tenants/accept-invite — accept an invitation token ─────────────
router.post('/accept-invite', requireAuth, async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ success: false, error: 'token required.' });

        const { data: invite, error } = await supabaseAdmin
            .from('invitations')
            .select('*')
            .eq('token', token)
            .single();

        if (error || !invite) return res.status(404).json({ success: false, error: 'Invalid invitation token.' });
        if (invite.accepted_at)              return res.status(409).json({ success: false, error: 'Invitation already accepted.' });
        if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ success: false, error: 'Invitation has expired.' });

        // Create tenant membership
        const { data: membership, error: memberError } = await supabaseAdmin
            .from('tenant_memberships')
            .insert([{
                user_id:     req.userId,
                tenant_id:   invite.tenant_id,
                role:        invite.role,
                invited_by:  invite.invited_by
            }])
            .select().single();
        if (memberError) throw memberError;

        // Mark invite as accepted
        await supabaseAdmin.from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id);

        await auditLog(invite.tenant_id, req.userId, 'accept_invite', 'invitation', invite.id, { role: invite.role });
        res.json({ success: true, data: membership, message: 'You have joined the coalition workspace!' });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── GET /api/tenants/invitations — list pending invitations ──────────────────
router.get('/invitations', requireAuth, requireRole('tenant_admin'), async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('invitations')
            .select('*')
            .eq('tenant_id', req.tenantId)
            .is('accepted_at', null)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── GET /api/tenants/audit — audit log for current tenant ───────────────────
router.get('/audit', requireAuth, requireRole('tenant_admin'), async (req, res) => {
    try {
        const limit  = parseInt(req.query.limit)  || 50;
        const offset = parseInt(req.query.offset) || 0;
        const { data, error, count } = await supabaseAdmin
            .from('audit_log')
            .select('*, profiles(full_name)', { count: 'exact' })
            .eq('tenant_id', req.tenantId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) throw error;
        res.json({ success: true, data, total: count });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── GET /api/tenants/my-tenants — list all tenants a user belongs to ─────────
router.get('/my-tenants', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('tenant_memberships')
            .select('role, is_active, tenants(id, name, slug, county, logo_url, plan, is_active)')
            .eq('user_id', req.userId)
            .eq('is_active', true);
        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
