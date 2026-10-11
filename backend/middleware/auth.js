try {
    require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });
    require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
    require('dotenv').config();
} catch (e) {}

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://pqkgkfgvwlsvcwjkptoy.supabase.co';
const serviceKey  = (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'your_supabase_service_role_key_here')
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_z--lu40gFNcIoXWIQTwXFQ_fC7S02Km');

// Service-role client (bypasses RLS — for admin/internal ops)
const supabaseAdmin = createClient(supabaseUrl, serviceKey);
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || 'a0000000-0000-0000-0000-000000000001';

// Role hierarchy weights (higher = more privileged)
const ROLE_WEIGHT = {
    super_admin:      100,
    owner:            85,
    tenant_admin:     80,
    campaign_manager: 60,
    manager:          60,
    field_agent:      40,
    analyst:          20,
    viewer:           10
};

// Permission map per role
const ROLE_PERMISSIONS = {
    super_admin:      ['*'],
    owner:            ['*'],
    tenant_admin:     ['read','write','delete','dispatch','invite','credentials','sql'],
    campaign_manager: ['read','write','dispatch','invite_field'],
    manager:          ['read','write','dispatch','invite_field'],
    field_agent:      ['read','write_constituent','rsvp'],
    analyst:          ['read'],
    viewer:           ['read_dashboard']
};

/**
 * requireAuth — verifies JWT, stamps req.user, req.tenantId, req.role
 */
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        // Fallback for development/demo or unauthenticated client unless ENFORCE_AUTH=true
        if (process.env.ENFORCE_AUTH !== 'true') {
            req.user = { id: '00000000-0000-0000-0000-000000000001', email: 'admin@naroktalksasa.ke' };
            req.userId = '00000000-0000-0000-0000-000000000001';
            req.tenantId = DEFAULT_TENANT_ID;
            req.role = 'tenant_admin';
            req.permissions = ['*'];
            return next();
        }
        return res.status(401).json({ success: false, error: 'Missing authorization token.' });
    }

    try {
        // Verify token with Supabase Auth
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            if (process.env.ENFORCE_AUTH !== 'true') {
                console.warn('[auth] Token verification failed; falling back to default tenant in development mode.');
                req.user = { id: '00000000-0000-0000-0000-000000000001', email: 'admin@naroktalksasa.ke' };
                req.userId = '00000000-0000-0000-0000-000000000001';
                req.tenantId = req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;
                req.role = 'super_admin';
                req.permissions = ['*'];
                return next();
            }
            return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
        }

        // Fetch user profile from database to get official role & tenant
        let profile = null;
        try {
            const { data: p } = await supabaseAdmin
                .from('user_profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            profile = p;
        } catch (_) {}

        // Check if user is super_admin
        const isSuperAdmin = (profile?.role === 'super_admin') || 
                             (user.email === 'admin@naroktalksasa.ke') || 
                             (user.user_metadata?.role === 'super_admin');

        const appRole = isSuperAdmin ? 'super_admin' : (profile?.role || user.user_metadata?.role || 'tenant_admin');

        // Resolve Tenant ID: Super Admins can switch via x-tenant-id header
        let tenantId = profile?.tenant_id || user.user_metadata?.tenant_id || DEFAULT_TENANT_ID;
        if (isSuperAdmin && req.headers['x-tenant-id']) {
            tenantId = req.headers['x-tenant-id'];
        }

        // Stamp request context
        req.user        = user;
        req.userId      = user.id;
        req.tenantId    = tenantId;
        req.role        = appRole;
        req.profile     = profile;
        req.permissions = ROLE_PERMISSIONS[appRole] || ['*'];

        // Compute Demo status if tenant is a demo trial
        try {
            const { data: tenant } = await supabaseAdmin
                .from('tenants')
                .select('id, name, subscription_status, settings, created_at')
                .eq('id', tenantId)
                .single();

            if (tenant) {
                const isDemo = tenant.settings?.is_demo === true || tenant.subscription_status === 'trial';
                if (isDemo) {
                    const now = Date.now();
                    const expiresAtStr = tenant.settings?.demo_expires_at || new Date(new Date(tenant.created_at || now).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
                    const expiresAt = new Date(expiresAtStr).getTime();
                    const isExpired = now > expiresAt;
                    const diffMs = Math.max(0, expiresAt - now);
                    req.demoStatus = {
                        isDemo: true,
                        expiresAt: expiresAtStr,
                        isExpired,
                        daysRemaining: Math.floor(diffMs / (1000 * 60 * 60 * 24)),
                        hoursRemaining: Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                        usePlatformApiKeys: Boolean(tenant.settings?.use_platform_api_keys ?? true)
                    };
                }
            }
        } catch (_) {}

        next();
    } catch (err) {
        console.error('[auth] JWT verification error:', err.message);
        if (process.env.ENFORCE_AUTH !== 'true') {
            req.user = { id: '00000000-0000-0000-0000-000000000001', email: 'admin@naroktalksasa.ke' };
            req.userId = '00000000-0000-0000-0000-000000000001';
            req.tenantId = req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;
            req.role = 'super_admin';
            req.permissions = ['*'];
            return next();
        }
        return res.status(401).json({ success: false, error: 'Authentication failed.' });
    }
}

/**
 * requireRole(...roles) — checks the caller has at least one of the listed roles
 * Usage: router.post('/dispatch', requireAuth, requireRole('campaign_manager','tenant_admin'), handler)
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        const userWeight = ROLE_WEIGHT[req.role] || 0;
        const minWeight  = Math.min(...allowedRoles.map(r => ROLE_WEIGHT[r] || 999));

        if (userWeight >= minWeight) return next();

        return res.status(403).json({
            success: false,
            error:   `Access denied. Requires role: ${allowedRoles.join(' or ')}.`,
            yourRole: req.role
        });
    };
}

/**
 * requirePermission(perm) — checks for a specific permission string
 */
function requirePermission(perm) {
    return (req, res, next) => {
        const perms = req.permissions || [];
        if (perms.includes('*') || perms.includes(perm)) return next();

        return res.status(403).json({
            success: false,
            error:   `Permission denied: '${perm}' required.`,
            yourRole: req.role
        });
    };
}

/**
 * optionalAuth — like requireAuth but doesn't reject if no token
 * Useful for public endpoints that optionally benefit from auth context
 */
async function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        req.tenantId = DEFAULT_TENANT_ID;
        return next();
    }

    try {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) {
            const jwtPayload = parseJwt(token);
            req.user     = user;
            req.userId   = user.id;
            req.tenantId = jwtPayload?.tenant_id || DEFAULT_TENANT_ID;
            req.role     = jwtPayload?.app_role  || 'viewer';
            req.permissions = ROLE_PERMISSIONS[req.role] || [];
        } else {
            req.tenantId = DEFAULT_TENANT_ID;
        }
    } catch (_) {
        req.tenantId = DEFAULT_TENANT_ID;
    }
    next();
}

/**
 * auditLog — write to audit_log table (fire-and-forget)
 */
async function auditLog(tenantId, userId, action, resourceType, resourceId, metadata = {}, ipAddress = null) {
    try {
        await supabaseAdmin.from('audit_log').insert([{
            tenant_id:     tenantId,
            user_id:       userId,
            action,
            resource_type: resourceType,
            resource_id:   resourceId,
            metadata,
            ip_address:    ipAddress
        }]);
    } catch (e) {
        console.error('[audit] Failed to write audit log:', e.message);
    }
}

/**
 * parseJwt — decode JWT payload without verification
 * (verification is done by Supabase; we just need the claims)
 */
function parseJwt(token) {
    try {
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    } catch (_) { return {}; }
}

module.exports = {
    supabaseAdmin,
    requireAuth,
    requireRole,
    requirePermission,
    optionalAuth,
    auditLog,
    ROLE_WEIGHT,
    ROLE_PERMISSIONS
};
