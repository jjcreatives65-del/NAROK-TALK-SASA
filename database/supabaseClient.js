'use strict';

/**
 * Talk Sasa - Express Supabase PostgreSQL Database Adapter
 * 
 * Provides:
 * 1. Admin Service Client (Elevated ops, webhooks, broadcast queue workers)
 * 2. Scoped User Client (Strict RLS enforcement using caller's JWT)
 * 3. Express Middleware for automatic tenant & database client injection
 * 4. High-performance helper methods for 400,000+ contact scale
 */

try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
  require('dotenv').config();
} catch (_) {}

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://pqkgkfgvwlsvcwjkptoy.supabase.co';
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_z--lu40gFNcIoXWIQTwXFQ_fC7S02Km';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceRoleKey) {
  console.warn('⚠️ [SupabaseClient] Warning: SUPABASE_SERVICE_ROLE_KEY is missing from environment. Background admin tasks will be limited.');
}

// ── 1. Global Admin Client (Bypasses RLS — for queue workers & webhooks) ──────
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey || supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ── 2. Factory: User Scoped Client (Enforces RLS via user's JWT) ──────────────
function getScopedClient(userToken) {
  if (!userToken) return supabaseAdmin;
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    }
  });
}

// ── 3. Express Middleware: Attach Tenant & Database Context ───────────────────
function tenantDbMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const headerTenantId = req.headers['x-tenant-id'];

  const defaultTenantId = process.env.DEFAULT_TENANT_ID || 'a0000000-0000-0000-0000-000000000001';
  const tenantId = req.tenantId || headerTenantId || defaultTenantId;

  const client = token ? getScopedClient(token) : supabaseAdmin;

  req.tenantId = tenantId;
  req.supabase = client;
  req.db = createTenantDbMethods(client, tenantId);

  next();
}

// ── 4. High-Performance Multi-Tenant Data Access Methods ──────────────────────
function createTenantDbMethods(client, tenantId) {
  return {
    raw: client,
    tenantId,

    // ── Contacts / Constituents CRM (Scale for 400,000+ contacts) ───────────
    async getContacts({ ward, search, is_opted_out, voter_status, limit = 50, offset = 0 } = {}) {
      let q = client
        .from('contacts')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId);

      if (ward && ward !== 'all') {
        q = q.eq('ward', ward);
      }
      if (is_opted_out !== undefined && is_opted_out !== null && is_opted_out !== 'all') {
        q = q.eq('is_opted_out', String(is_opted_out) === 'true');
      }
      if (voter_status && voter_status !== 'all') {
        q = q.eq('voter_status', voter_status);
      }
      if (search && search.trim()) {
        const s = search.trim();
        q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone_number.ilike.%${s}%,national_id.ilike.%${s}%,ward.ilike.%${s}%`);
      }

      q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      const { data, count, error } = await q;
      if (error) throw new Error(`[db.getContacts] ${error.message}`);
      return { total: count || 0, contacts: data || [] };
    },

    async createContact(contact) {
      const record = {
        tenant_id: tenantId,
        phone_number: contact.phone_number,
        email: contact.email || null,
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        national_id: contact.national_id || null,
        county: contact.county || 'Narok',
        ward: contact.ward || null,
        polling_station: contact.polling_station || null,
        is_opted_out: Boolean(contact.is_opted_out),
        voter_status: contact.voter_status || 'registered',
        preferred_channel: contact.preferred_channel || 'sms',
        tags: Array.isArray(contact.tags) ? contact.tags : [],
        metadata: contact.metadata || {}
      };

      const { data, error } = await client
        .from('contacts')
        .upsert(record, { onConflict: 'tenant_id,phone_number' })
        .select()
        .single();

      if (error) throw new Error(`[db.createContact] ${error.message}`);
      return data;
    },

    async bulkImportContacts(contactsList, onProgress) {
      const BATCH_SIZE = 1000;
      let insertedCount = 0;

      for (let i = 0; i < contactsList.length; i += BATCH_SIZE) {
        const batch = contactsList.slice(i, i + BATCH_SIZE).map(c => ({
          tenant_id: tenantId,
          phone_number: c.phone_number,
          email: c.email || null,
          first_name: c.first_name || '',
          last_name: c.last_name || '',
          national_id: c.national_id || null,
          county: c.county || 'Narok',
          ward: c.ward || null,
          polling_station: c.polling_station || null,
          is_opted_out: Boolean(c.is_opted_out),
          voter_status: c.voter_status || 'registered',
          tags: Array.isArray(c.tags) ? c.tags : []
        }));

        const { error, count } = await client
          .from('contacts')
          .upsert(batch, { onConflict: 'tenant_id,phone_number', count: 'exact' });

        if (error) throw new Error(`[db.bulkImportContacts] Batch ${i / BATCH_SIZE + 1} failed: ${error.message}`);
        insertedCount += (count || batch.length);

        if (onProgress) {
          onProgress({ processed: Math.min(i + BATCH_SIZE, contactsList.length), total: contactsList.length });
        }
      }
      return { totalImported: insertedCount };
    },

    // ── Campaigns ─────────────────────────────────────────────────────────
    async getCampaigns({ status, type, limit = 50, offset = 0 } = {}) {
      let q = client
        .from('campaigns')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId);

      if (status && status !== 'all') q = q.eq('status', status);
      if (type && type !== 'all') q = q.eq('type', type);

      q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      const { data, count, error } = await q;
      if (error) throw new Error(`[db.getCampaigns] ${error.message}`);
      return { total: count || 0, campaigns: data || [] };
    },

    async createCampaign({ name, type = 'sms', message_body, sender_id, target_ward, target_county, scheduled_at, created_by }) {
      const record = {
        tenant_id: tenantId,
        name: name || 'Untitled Campaign',
        campaign_name: name || 'Untitled Campaign',
        type,
        channel: type,
        status: 'pending',
        message_body: message_body || '',
        sender_id: sender_id || 'TALKSASA',
        target_ward: target_ward || null,
        target_county: target_county || 'Narok',
        scheduled_at: scheduled_at || new Date().toISOString(),
        created_by: created_by || null
      };

      const { data, error } = await client
        .from('campaigns')
        .insert(record)
        .select()
        .single();

      if (error) throw new Error(`[db.createCampaign] ${error.message}`);
      return data;
    },

    async updateCampaignStatus(campaignId, status, stats = {}) {
      const updates = { status, updated_at: new Date().toISOString() };
      if (stats.successful_deliveries !== undefined) updates.successful_deliveries = stats.successful_deliveries;
      if (stats.failed_deliveries !== undefined) updates.failed_deliveries = stats.failed_deliveries;
      if (stats.total_recipients !== undefined) updates.total_recipients = stats.total_recipients;

      const { data, error } = await client
        .from('campaigns')
        .update(updates)
        .eq('id', campaignId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw new Error(`[db.updateCampaignStatus] ${error.message}`);
      return data;
    },

    // ── Tenants ───────────────────────────────────────────────────────────
    async getTenantDetails() {
      const { data, error } = await client
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

      if (error) throw new Error(`[db.getTenantDetails] ${error.message}`);
      return data;
    },

    async updateTenantDetails(updates) {
      const { data, error } = await client
        .from('tenants')
        .update(updates)
        .eq('id', tenantId)
        .select()
        .single();

      if (error) throw new Error(`[db.updateTenantDetails] ${error.message}`);
      return data;
    },

    // ── Stream Keys (Phase 5 Live Broadcasting) ───────────────────────────
    async getStreamKeys() {
      const { data, error } = await client
        .from('stream_keys')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(`[db.getStreamKeys] ${error.message}`);
      return data || [];
    },

    async createStreamKey(stream_title, destinations = []) {
      const { data, error } = await client
        .from('stream_keys')
        .insert({
          tenant_id: tenantId,
          stream_title,
          destinations
        })
        .select()
        .single();

      if (error) throw new Error(`[db.createStreamKey] ${error.message}`);
      return data;
    },

    // ── Social Integrations (Phase 4 OAuth) ────────────────────────────────
    async getSocialIntegrations() {
      const { data, error } = await client
        .from('social_integrations')
        .select('id, platform, account_id, account_name, scopes, status, token_expires_at, created_at')
        .eq('tenant_id', tenantId);

      if (error) throw new Error(`[db.getSocialIntegrations] ${error.message}`);
      return data || [];
    }
  };
}

// ── 5. System RTMP Authentication (OBS Ingest Handshake) ──────────────────────
async function verifyIngestKey(talk_sasa_ingest_key) {
  const { data, error } = await supabaseAdmin
    .from('stream_keys')
    .select('id, tenant_id, stream_title, destinations, is_live')
    .eq('talk_sasa_ingest_key', talk_sasa_ingest_key)
    .single();

  if (error || !data) return { valid: false, error: 'Invalid OBS Ingest Key' };
  return { valid: true, stream: data };
}

module.exports = {
  supabaseAdmin,
  getScopedClient,
  tenantDbMiddleware,
  createTenantDbMethods,
  verifyIngestKey
};
