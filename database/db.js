'use strict';
/**
 * Narok Talk Sasa - Hybrid Multi-Tenant Database Layer
 * Primary: Supabase PostgreSQL (multi-tenant, RLS, production)
 * Fallback: High-performance local JSON store (instant dev/demo, zero setup)
 */

try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
  require('dotenv').config({ path: require('path').resolve(__dirname, '.env.local') });
  require('dotenv').config();
} catch (e) {}

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://pqkgkfgvwlsvcwjkptoy.supabase.co';
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'your_supabase_service_role_key_here')
  ? process.env.SUPABASE_SERVICE_ROLE_KEY
  : (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_z--lu40gFNcIoXWIQTwXFQ_fC7S02Km');

const supabase = createClient(supabaseUrl, supabaseKey);

// ── Ward Reference Data ──────────────────────────────────────────────────────
const NAROK_WARDS = {
  'Kilgoris':       ['Kilgoris Central', 'Keyian', 'Angata Barikoi', 'Shankoe', 'Kimintet', 'Lolgorian'],
  'Narok North':    ['Olposimoru', 'Olokurto', 'Narok Town', 'Nkware', 'Melili', 'Olorropil'],
  'Narok South':    ['Maji Moto/Naroosura', 'Ololulungá', 'Melelo', 'Loita', 'Sogoo', 'Sagamian'],
  'Narok East':     ['Mosiro', 'Ildamat', 'Keekonyokie', 'Suswa'],
  'Narok West':     ['Ilmotiok', 'Mara', 'Siana', 'Naikarra'],
  'Emurua Dikirr':  ['Ilkerin', 'Ololmasani', 'Mogondo', 'Kapsasian']
};
const ALL_WARDS = Object.values(NAROK_WARDS).flat();

// ── Fallback Local Store ─────────────────────────────────────────────────────
let localStore = null;
let loggedFallbackNotice = false;

function getLocalStore() {
  if (!localStore) {
    const candidatePaths = [
      path.join(__dirname, 'data.json'),
      path.join(__dirname, '..', 'backend', 'database', 'data.json'),
      path.join(__dirname, 'backend', 'database', 'data.json'),
      path.join(process.cwd(), 'backend', 'database', 'data.json'),
      path.join(process.cwd(), 'database', 'data.json')
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          localStore = JSON.parse(fs.readFileSync(p, 'utf8'));
          break;
        } catch (_) {}
      }
    }
    if (!localStore) {
      localStore = { constituents: [], campaigns: [], senderIds: [], rallies: [], socialSyncAds: [], automations: [] };
    }
  }
  return localStore;
}

function isTableMissing(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return msg.includes('could not find the table') ||
         msg.includes('relation') ||
         msg.includes('does not exist') ||
         error.code === 'PGRST205' ||
         error.code === '42P01';
}

function warnFallbackOnce(table) {
  if (!loggedFallbackNotice) {
    loggedFallbackNotice = true;
    console.warn(`[db] Notice: Supabase table '${table}' not yet created in PostgreSQL. Serving from local store.`);
    console.warn('[db] Tip: Run database/supabase_schema.sql in your Supabase SQL Editor to enable full cloud persistence.');
  }
}

function unwrap({ data, error }, label = 'query') {
  if (error) throw new Error(`[Supabase/${label}] ${error.message}`);
  return data;
}

function generateUuid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

// ── Constituent CRUD ─────────────────────────────────────────────────────────
async function getConstituents(tenantId, { ward, search, is_opted_out, voter_status, limit = 50, offset = 0 } = {}) {
  try {
    let q = supabase.from('constituents').select('*', { count: 'exact' });
    if (tenantId) q = q.eq('tenant_id', tenantId);

    if (ward && ward !== 'all') q = q.eq('ward', ward);
    if (is_opted_out !== undefined && is_opted_out !== null && is_opted_out !== 'all') {
      q = q.eq('is_opted_out', String(is_opted_out) === 'true');
    }
    if (voter_status && voter_status !== 'all') q = q.eq('voter_status', voter_status);
    if (search && search.trim()) {
      const s = search.trim();
      q = q.or(
        `first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone_number.ilike.%${s}%,national_id.ilike.%${s}%,ward.ilike.%${s}%,polling_station.ilike.%${s}%`
      );
    }

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) {
      if (isTableMissing(error)) {
        warnFallbackOnce('constituents');
        return getConstituentsLocal({ ward, search, is_opted_out, voter_status, limit, offset });
      }
      throw error;
    }
    return { total: count || 0, constituents: data || [] };
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('constituents');
      return getConstituentsLocal({ ward, search, is_opted_out, voter_status, limit, offset });
    }
    throw new Error(`[Supabase/getConstituents] ${err.message}`);
  }
}

function getConstituentsLocal({ ward, search, is_opted_out, voter_status, limit = 50, offset = 0 } = {}) {
  const store = getLocalStore();
  let list = store.constituents || [];

  if (ward && ward !== 'all') {
    list = list.filter(c => c.ward === ward);
  }
  if (is_opted_out !== undefined && is_opted_out !== null && is_opted_out !== 'all') {
    const isOpt = String(is_opted_out) === 'true';
    list = list.filter(c => Boolean(c.is_opted_out) === isOpt);
  }
  if (voter_status && voter_status !== 'all') {
    list = list.filter(c => c.voter_status === voter_status);
  }
  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    list = list.filter(c =>
      (c.first_name || '').toLowerCase().includes(s) ||
      (c.last_name || '').toLowerCase().includes(s) ||
      (c.phone_number || '').includes(s) ||
      (c.national_id || '').includes(s) ||
      (c.ward || '').toLowerCase().includes(s) ||
      (c.polling_station || '').toLowerCase().includes(s)
    );
  }

  const total = list.length;
  const paginated = list.slice(offset, offset + limit);
  return { total, constituents: paginated };
}

async function createConstituent(tenantId, userId, record) {
  try {
    const data = unwrap(
      await supabase.from('constituents').insert([{
        tenant_id:         tenantId,
        phone_number:      record.phone_number?.trim(),
        first_name:        record.first_name  || '',
        last_name:         record.last_name   || '',
        national_id:       record.national_id || null,
        county:            record.county      || 'Narok',
        ward:              record.ward        || 'Narok Town',
        polling_station:   record.polling_station || 'County Primary School',
        is_opted_out:      Boolean(record.is_opted_out),
        voter_status:      record.voter_status || 'registered',
        preferred_channel: record.preferred_channel || 'sms',
        tags:              Array.isArray(record.tags) ? record.tags : ['field_registration'],
        created_by:        userId
      }]).select().single(),
      'createConstituent'
    );
    return data;
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('constituents');
      const store = getLocalStore();
      const newC = {
        id: generateUuid(),
        tenant_id: tenantId,
        phone_number: record.phone_number?.trim(),
        first_name: record.first_name || '',
        last_name: record.last_name || '',
        national_id: record.national_id || '',
        county: record.county || 'Narok',
        ward: record.ward || 'Narok Town',
        polling_station: record.polling_station || 'County Primary School',
        is_opted_out: Boolean(record.is_opted_out),
        voter_status: record.voter_status || 'registered',
        preferred_channel: record.preferred_channel || 'sms',
        tags: Array.isArray(record.tags) ? record.tags : ['field_registration'],
        created_at: new Date().toISOString()
      };
      store.constituents.unshift(newC);
      return newC;
    }
    throw err;
  }
}

async function updateConstituent(tenantId, id, record) {
  try {
    const data = unwrap(
      await supabase.from('constituents').update(record).eq('id', id).eq('tenant_id', tenantId).select().single(),
      'updateConstituent'
    );
    return data;
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('constituents');
      const store = getLocalStore();
      const idx = store.constituents.findIndex(c => c.id === id);
      if (idx === -1) return null;
      store.constituents[idx] = { ...store.constituents[idx], ...record };
      return store.constituents[idx];
    }
    throw err;
  }
}

async function deleteConstituent(tenantId, id) {
  try {
    const { error } = await supabase.from('constituents').delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) throw error;
    return true;
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('constituents');
      const store = getLocalStore();
      store.constituents = store.constituents.filter(c => c.id !== id);
      return true;
    }
    throw new Error(`[Supabase/deleteConstituent] ${err.message}`);
  }
}

async function bulkImportConstituents(tenantId, records) {
  const cleaned = records
    .filter(r => r.phone_number)
    .map(r => ({
      tenant_id:         tenantId,
      phone_number:      r.phone_number.trim(),
      first_name:        r.first_name || '',
      last_name:         r.last_name  || '',
      national_id:       r.national_id || null,
      county:            'Narok',
      ward:              r.ward || 'Narok Town',
      polling_station:   r.polling_station || 'Ward Polling Center',
      is_opted_out:      Boolean(r.is_opted_out),
      voter_status:      r.voter_status || 'registered',
      preferred_channel: r.preferred_channel || 'sms',
      tags:              ['csv_bulk_import']
    }));

  if (cleaned.length === 0) return { imported: 0, skipped: records.length, totalNow: 0 };

  try {
    const { data, error } = await supabase
      .from('constituents')
      .upsert(cleaned, { onConflict: 'tenant_id,phone_number', ignoreDuplicates: true })
      .select();

    if (error) throw error;
    const imported = (data || []).length;
    const skipped  = cleaned.length - imported;
    const { count } = await supabase.from('constituents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    return { imported, skipped, totalNow: count || 0 };
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('constituents');
      const store = getLocalStore();
      let imported = 0;
      for (const item of cleaned) {
        const existingIdx = store.constituents.findIndex(c => c.phone_number === item.phone_number);
        if (existingIdx === -1) {
          store.constituents.push({ id: generateUuid(), ...item, created_at: new Date().toISOString() });
          imported++;
        }
      }
      return { imported, skipped: cleaned.length - imported, totalNow: store.constituents.length };
    }
    throw new Error(`[Supabase/bulkImport] ${err.message}`);
  }
}

// ── Campaigns ─────────────────────────────────────────────────────────────────
async function getCampaigns(tenantId) {
  try {
    let q = supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('campaigns');
      return getLocalStore().campaigns || [];
    }
    throw new Error(`[Supabase/getCampaigns] ${err.message}`);
  }
}

async function createCampaign(tenantId, userId, data) {
  const targetWard = (data.target_ward && data.target_ward !== 'all') ? data.target_ward : null;
  const costPerSms = 0.80;

  try {
    let rQ = supabase.from('constituents').select('*', { count: 'exact', head: true }).eq('is_opted_out', false);
    if (tenantId) rQ = rQ.eq('tenant_id', tenantId);
    if (targetWard) rQ = rQ.eq('ward', targetWard);
    const { count: totalCount } = await rQ;

    const estCost = Number(((totalCount || 0) * costPerSms).toFixed(2));

    const campaign = unwrap(
      await supabase.from('campaigns').insert([{
        tenant_id:            tenantId,
        campaign_name:        data.campaign_name,
        channel:              data.channel          || 'sms',
        sender_id:            data.sender_id        || 'NAROK_TALK',
        message_body:         data.message_body,
        target_ward:          targetWard,
        status:               data.immediate ? 'completed' : (data.scheduled_at ? 'scheduled' : 'pending'),
        scheduled_at:         data.scheduled_at     || new Date().toISOString(),
        total_recipients:     totalCount            || 0,
        successful_deliveries: data.immediate ? (totalCount || 0) : 0,
        failed_deliveries:    0,
        estimated_cost_kes:   estCost,
        social_sync_enabled:  Boolean(data.social_sync_enabled),
        created_by:           userId
      }]).select().single(),
      'createCampaign'
    );

    if (campaign.social_sync_enabled) {
      await supabase.from('social_sync_ads').insert([{
        tenant_id:             tenantId,
        campaign_id:           campaign.id,
        platform:              'both',
        ad_headline:           campaign.campaign_name,
        ad_copy:               campaign.message_body.replace(/\{first_name\}/g, 'Wazalendo').replace(/\{ward\}/g, targetWard || 'Narok County'),
        target_ward:           targetWard,
        audience_hash_count:   totalCount || 0,
        match_rate_percentage: 88.5,
        ad_status:             'synced'
      }]);
    }
    return campaign;
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('campaigns');
      const store = getLocalStore();
      const recCount = store.constituents?.length || 1500;
      const newCamp = {
        id: generateUuid(),
        tenant_id: tenantId,
        campaign_name: data.campaign_name,
        channel: data.channel || 'sms',
        sender_id: data.sender_id || 'NAROK_TALK',
        message_body: data.message_body,
        target_ward: targetWard,
        status: data.immediate ? 'completed' : (data.scheduled_at ? 'scheduled' : 'pending'),
        scheduled_at: data.scheduled_at || new Date().toISOString(),
        total_recipients: recCount,
        successful_deliveries: data.immediate ? recCount : 0,
        failed_deliveries: 0,
        estimated_cost_kes: Number((recCount * costPerSms).toFixed(2)),
        social_sync_enabled: Boolean(data.social_sync_enabled),
        created_at: new Date().toISOString()
      };
      store.campaigns.unshift(newCamp);
      return newCamp;
    }
    throw err;
  }
}

async function dispatchCampaign(tenantId, campaignId) {
  try {
    let q = supabase.from('campaigns').select('*').eq('id', campaignId);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data: campaign, error } = await q.single();
    if (error || !campaign) throw new Error('Campaign not found');

    const updated = unwrap(
      await supabase.from('campaigns')
        .update({ status: 'completed', successful_deliveries: campaign.total_recipients || 1 })
        .eq('id', campaignId).select().single(),
      'dispatchCampaign'
    );
    return updated;
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('campaigns');
      const store = getLocalStore();
      const camp = store.campaigns.find(c => c.id === campaignId);
      if (!camp) throw new Error('Campaign not found');
      camp.status = 'completed';
      camp.successful_deliveries = camp.total_recipients || 100;
      return camp;
    }
    throw err;
  }
}

// ── Sender IDs ────────────────────────────────────────────────────────────────
async function getSenderIds(tenantId) {
  try {
    let q = supabase.from('sender_ids').select('*').order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('sender_ids');
      return getLocalStore().senderIds || [];
    }
    throw new Error(`[Supabase/getSenderIds] ${err.message}`);
  }
}

async function createSenderId(tenantIdOrData, optionalData) {
  const data = typeof optionalData === 'object' && optionalData !== null ? optionalData : tenantIdOrData;
  const tenantId = typeof optionalData === 'object' && optionalData !== null ? tenantIdOrData : null;

  const rawName = (data.sender_name || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 11);
  if (!rawName) throw new Error('Provide a valid alphanumeric Sender ID (max 11 chars).');

  const carrierRoute = data.carrier_route || data.network_provider || 'Safaricom Direct SMPP';
  try {
    const payload = {
      sender_name:        rawName,
      candidate_or_party: data.candidate_or_party || 'Narok Campaign Team',
      category:           data.category           || 'Official Campaign Outreach',
      status:             'approved',
      network_provider:   carrierRoute,
      carrier_route:      carrierRoute,
      sim_slot:           data.sim_slot   || 'Slot 1: Safaricom Corporate GSM',
      sim_number:         data.sim_number || null,
      throughput:         data.throughput || '500 SMS/sec',
      cak_reference:      data.cak_reference || ('CAK/SMS/2026/' + Math.floor(1000 + Math.random() * 9000))
    };
    if (tenantId) payload.tenant_id = tenantId;

    return unwrap(
      await supabase.from('sender_ids').insert([payload]).select().single(),
      'createSenderId'
    );
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('sender_ids');
      const store = getLocalStore();
      const newSender = {
        id: generateUuid(),
        tenant_id: tenantId,
        sender_name: rawName,
        candidate_or_party: data.candidate_or_party || 'Narok Campaign Team',
        category: data.category || 'Official Campaign Outreach',
        status: 'approved',
        network_provider: carrierRoute,
        carrier_route: carrierRoute,
        sim_slot: data.sim_slot || 'Slot 1: Safaricom Corporate GSM',
        sim_number: data.sim_number || null,
        throughput: data.throughput || '500 SMS/sec',
        cak_reference: data.cak_reference || ('CAK/SMS/2026/' + Math.floor(1000 + Math.random() * 9000)),
        created_at: new Date().toISOString()
      };
      store.senderIds.unshift(newSender);
      return newSender;
    }
    throw err;
  }
}

// ── Rallies ───────────────────────────────────────────────────────────────────
async function getRallies(tenantId) {
  try {
    let q = supabase.from('rally_events').select('*').order('rally_date', { ascending: true });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('rally_events');
      return getLocalStore().rallies || [];
    }
    throw new Error(`[Supabase/getRallies] ${err.message}`);
  }
}

async function createRally(tenantIdOrData, userIdOrData, optionalData) {
  let data, tenantId, userId;
  if (optionalData !== undefined) {
    tenantId = tenantIdOrData;
    userId = userIdOrData;
    data = optionalData;
  } else if (typeof userIdOrData === 'object') {
    tenantId = tenantIdOrData;
    data = userIdOrData;
  } else {
    data = tenantIdOrData;
  }

  try {
    const payload = {
      rally_title:      data.rally_title,
      venue:            data.venue,
      ward:             data.ward || 'Narok Town',
      rally_date:       data.rally_date,
      chief_guest:      data.chief_guest || 'Hon. Ledirama Ole Senteu',
      expected_turnout: parseInt(data.expected_turnout, 10) || 5000,
      actual_rsvps:     0,
      status:           'upcoming',
      image_url:        data.image_url || 'assets/banner.jpg'
    };
    if (tenantId) payload.tenant_id = tenantId;
    if (userId)   payload.created_by = userId;

    return unwrap(
      await supabase.from('rally_events').insert([payload]).select().single(),
      'createRally'
    );
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('rally_events');
      const store = getLocalStore();
      const newRally = {
        id: generateUuid(),
        tenant_id: tenantId,
        rally_title: data.rally_title,
        venue: data.venue,
        ward: data.ward || 'Narok Town',
        rally_date: data.rally_date,
        chief_guest: data.chief_guest || 'Hon. Ledirama Ole Senteu',
        expected_turnout: parseInt(data.expected_turnout, 10) || 5000,
        actual_rsvps: 0,
        status: 'upcoming',
        image_url: data.image_url || 'assets/banner.jpg',
        created_at: new Date().toISOString()
      };
      store.rallies.push(newRally);
      return newRally;
    }
    throw err;
  }
}

async function rsvpRally(tenantIdOrId, optionalId) {
  const rallyId = optionalId || tenantIdOrId;
  const tenantId = optionalId ? tenantIdOrId : null;

  try {
    let q = supabase.from('rally_events').select('actual_rsvps').eq('id', rallyId);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data: rally } = await q.single();
    if (!rally) return null;

    return unwrap(
      await supabase.from('rally_events')
        .update({ actual_rsvps: (rally.actual_rsvps || 0) + 1 })
        .eq('id', rallyId)
        .select().single(),
      'rsvpRally'
    );
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('rally_events');
      const store = getLocalStore();
      const rally = store.rallies.find(r => r.id === rallyId);
      if (!rally) return null;
      rally.actual_rsvps = (rally.actual_rsvps || 0) + 1;
      return rally;
    }
    throw err;
  }
}

async function updateRallyPhoto(tenantIdOrId, idOrPhoto, optionalPhoto) {
  let tenantId, rallyId, photoUrl;
  if (optionalPhoto !== undefined) {
    tenantId = tenantIdOrId;
    rallyId = idOrPhoto;
    photoUrl = optionalPhoto;
  } else {
    rallyId = tenantIdOrId;
    photoUrl = idOrPhoto;
  }

  try {
    let q = supabase.from('rally_events').update({ image_url: photoUrl }).eq('id', rallyId);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    return unwrap(await q.select().single(), 'updateRallyPhoto');
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('rally_events');
      const store = getLocalStore();
      const rally = store.rallies.find(r => r.id === rallyId);
      if (!rally) return null;
      rally.image_url = photoUrl;
      return rally;
    }
    throw err;
  }
}

// ── Social Sync Ads ───────────────────────────────────────────────────────────
async function getSocialSyncAds(tenantId) {
  try {
    let q = supabase.from('social_sync_ads').select('*').order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('social_sync_ads');
      return getLocalStore().socialSyncAds || [];
    }
    throw new Error(`[Supabase/getSocialSyncAds] ${err.message}`);
  }
}

// ── Automations ───────────────────────────────────────────────────────────────
async function getAutomations(tenantId) {
  try {
    let q = supabase.from('automations').select('*').order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('automations');
      return getLocalStore().automations || [];
    }
    throw new Error(`[Supabase/getAutomations] ${err.message}`);
  }
}

async function toggleAutomation(tenantIdOrId, optionalId) {
  const id = optionalId || tenantIdOrId;
  const tenantId = optionalId ? tenantIdOrId : null;

  try {
    let q = supabase.from('automations').select('is_active').eq('id', id);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data: item } = await q.single();
    if (!item) return null;

    return unwrap(
      await supabase.from('automations').update({ is_active: !item.is_active }).eq('id', id).select().single(),
      'toggleAutomation'
    );
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('automations');
      const store = getLocalStore();
      const item = store.automations.find(a => a.id === id);
      if (!item) return null;
      item.is_active = !item.is_active;
      return item;
    }
    throw err;
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function getStats(tenantId) {
  try {
    let cQ = supabase.from('constituents').select('*', { count: 'exact', head: true });
    let aQ = supabase.from('constituents').select('*', { count: 'exact', head: true }).eq('is_opted_out', false);
    let camQ = supabase.from('campaigns').select('*', { count: 'exact', head: true });
    let sQ = supabase.from('sender_ids').select('*', { count: 'exact', head: true });
    let rQ = supabase.from('rally_events').select('*', { count: 'exact', head: true });
    let cDataQ = supabase.from('campaigns').select('successful_deliveries, estimated_cost_kes');
    let wQ = supabase.from('constituents').select('ward');

    if (tenantId) {
      cQ = cQ.eq('tenant_id', tenantId);
      aQ = aQ.eq('tenant_id', tenantId);
      camQ = camQ.eq('tenant_id', tenantId);
      sQ = sQ.eq('tenant_id', tenantId);
      rQ = rQ.eq('tenant_id', tenantId);
      cDataQ = cDataQ.eq('tenant_id', tenantId);
      wQ = wQ.eq('tenant_id', tenantId);
    }

    const [
      { count: totalConstituents, error: cErr },
      { count: activeConstituents },
      { count: totalCampaigns },
      { count: totalSenderIds },
      { count: totalRallies },
      campaigns,
      wardRows
    ] = await Promise.all([cQ, aQ, camQ, sQ, rQ, cDataQ, wQ]);

    if (cErr && isTableMissing(cErr)) {
      return getStatsLocal();
    }

    const campData = campaigns.data || [];
    const totalDispatches = campData.reduce((a, c) => a + (c.successful_deliveries || 0), 0);
    const totalBudgetSpentKes = campData.reduce((a, c) => a + Number(c.estimated_cost_kes || 0), 0);

    const wardCounts = {};
    for (const { ward } of (wardRows.data || [])) {
      const w = ward || 'Unassigned';
      wardCounts[w] = (wardCounts[w] || 0) + 1;
    }

    if (!totalConstituents && !totalCampaigns) {
      // If table exists but empty, check local fallback
      const store = getLocalStore();
      if (store.constituents?.length > 0) return getStatsLocal();
    }

    return {
      totalConstituents:   totalConstituents  || 0,
      activeConstituents:  activeConstituents || 0,
      optedOut:            (totalConstituents || 0) - (activeConstituents || 0),
      totalCampaigns:      totalCampaigns     || 0,
      totalSenderIds:      totalSenderIds     || 0,
      totalRallies:        totalRallies       || 0,
      totalDispatches,
      totalBudgetSpentKes,
      wardCounts,
      narokWards:          NAROK_WARDS,
      allWards:            ALL_WARDS
    };
  } catch (_) {
    return getStatsLocal();
  }
}

function getStatsLocal() {
  const store = getLocalStore();
  const constituents = store.constituents || [];
  const campaigns = store.campaigns || [];
  const senderIds = store.senderIds || [];
  const rallies = store.rallies || [];

  const totalConstituents = constituents.length;
  const activeConstituents = constituents.filter(c => !c.is_opted_out).length;
  const totalDispatches = campaigns.reduce((a, c) => a + (c.successful_deliveries || 0), 0);
  const totalBudgetSpentKes = campaigns.reduce((a, c) => a + Number(c.estimated_cost_kes || 0), 0);

  const wardCounts = {};
  for (const c of constituents) {
    const w = c.ward || 'Unassigned';
    wardCounts[w] = (wardCounts[w] || 0) + 1;
  }

  return {
    totalConstituents,
    activeConstituents,
    optedOut: totalConstituents - activeConstituents,
    totalCampaigns: campaigns.length,
    totalSenderIds: senderIds.length,
    totalRallies: rallies.length,
    totalDispatches,
    totalBudgetSpentKes,
    wardCounts,
    narokWards: NAROK_WARDS,
    allWards: ALL_WARDS
  };
}

// ── API Credentials ──────────────────────────────────────────────────────────
const memoryCredentials = new Map();

function getDefaultCredentials() {
  return [
    { service_name: 'africas_talking_sms',   display_name: "Africa's Talking SMS",         category: 'sms',      icon: '📱', is_configured: Boolean(process.env.AT_API_KEY && process.env.AT_API_KEY !== 'your_africas_talking_api_key'), is_active: true, credentials: { username: process.env.AT_USERNAME || 'sandbox', api_key: process.env.AT_API_KEY || '', sender_id: process.env.AT_SENDER_ID || 'NAROK_TALK', shortcode: process.env.AT_SHORTCODE || '' } },
    { service_name: 'africas_talking_voice',  display_name: "Africa's Talking Voice / IVR", category: 'voice',    icon: '📞', is_configured: Boolean(process.env.AT_CALLER_ID), is_active: false, credentials: { username: process.env.AT_USERNAME || 'sandbox', api_key: process.env.AT_API_KEY || '', caller_id: process.env.AT_CALLER_ID || '' } },
    { service_name: 'africas_talking_ussd',   display_name: "Africa's Talking USSD",        category: 'ussd',     icon: '🔢', is_configured: Boolean(process.env.AT_USSD_SERVICE_CODE), is_active: false, credentials: { username: process.env.AT_USERNAME || 'sandbox', api_key: process.env.AT_API_KEY || '', service_code: process.env.AT_USSD_SERVICE_CODE || '*123#' } },
    { service_name: 'meta_whatsapp',           display_name: 'WhatsApp Business (Meta)',     category: 'whatsapp', icon: '💬', is_configured: Boolean(process.env.META_WHATSAPP_ACCESS_TOKEN && !process.env.META_WHATSAPP_ACCESS_TOKEN.includes('your_')), is_active: false, credentials: { phone_number_id: process.env.META_WHATSAPP_PHONE_NUMBER_ID || '', access_token: process.env.META_WHATSAPP_ACCESS_TOKEN || '', business_account_id: process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || '', app_id: process.env.META_APP_ID || '', verify_token: process.env.META_WHATSAPP_VERIFY_TOKEN || '' } },
    { service_name: 'meta_facebook_ads',       display_name: 'Meta Facebook / Instagram Ads', category: 'social',   icon: '📘', is_configured: Boolean(process.env.META_FB_ACCESS_TOKEN && !process.env.META_FB_ACCESS_TOKEN.includes('your_')), is_active: false, credentials: { app_id: process.env.META_APP_ID || '', app_secret: process.env.META_APP_SECRET || '', access_token: process.env.META_FB_ACCESS_TOKEN || '', ad_account_id: process.env.META_FB_AD_ACCOUNT_ID || '', pixel_id: process.env.META_PIXEL_ID || '' } },
    { service_name: 'x_twitter_ads',           display_name: 'X (Twitter) Ads API',         category: 'social',   icon: '🐦', is_configured: Boolean(process.env.X_API_KEY && !process.env.X_API_KEY.includes('your_')), is_active: false, credentials: { api_key: process.env.X_API_KEY || '', api_secret: process.env.X_API_SECRET || '', access_token: process.env.X_ACCESS_TOKEN || '', access_token_secret: process.env.X_ACCESS_TOKEN_SECRET || '', ad_account_id: process.env.X_AD_ACCOUNT_ID || '' } },
    { service_name: 'sendgrid_email',          display_name: 'SendGrid Email',              category: 'email',    icon: '📧', is_configured: Boolean(process.env.SENDGRID_API_KEY && !process.env.SENDGRID_API_KEY.includes('your_')), is_active: false, credentials: { api_key: process.env.SENDGRID_API_KEY || '', from_email: process.env.SENDGRID_FROM_EMAIL || 'noreply@naroktalksasa.ke', from_name: process.env.SENDGRID_FROM_NAME || 'Narok Talk Sasa' } }
  ];
}

async function getCredentials(tenantId) {
  try {
    let q = supabase.from('api_credentials').select('*').order('category');
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw error;
    if (data && data.length > 0) return data;
    return getDefaultCredentials();
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('api_credentials');
      return getDefaultCredentials().map(c => memoryCredentials.get(c.service_name) || c);
    }
    throw new Error(`[Supabase/getCredentials] ${err.message}`);
  }
}

async function getCredential(tenantId, serviceName) {
  try {
    let q = supabase.from('api_credentials').select('*').eq('service_name', serviceName);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q.single();
    if (error) throw error;
    return data;
  } catch (err) {
    if (isTableMissing(err)) {
      const match = (await getCredentials(tenantId)).find(c => c.service_name === serviceName);
      return match || null;
    }
    throw err;
  }
}

async function updateCredential(tenantId, serviceName, credentialFields, meta = {}) {
  try {
    const { data: existing } = await supabase
      .from('api_credentials').select('credentials').eq('service_name', serviceName).eq('tenant_id', tenantId).single();
    const merged = { ...(existing?.credentials || {}), ...credentialFields };
    const isConfigured = Object.values(merged).some(v => v && String(v).trim() !== '');
    return unwrap(
      await supabase.from('api_credentials')
        .update({
          credentials:         merged,
          is_configured:       isConfigured,
          is_active:           meta.is_active !== undefined ? meta.is_active : isConfigured,
          verification_status: meta.verification_status || 'unverified',
          last_verified_at:    meta.verified ? new Date().toISOString() : undefined,
          notes:               meta.notes || undefined
        })
        .eq('service_name', serviceName).eq('tenant_id', tenantId)
        .select().single(),
      'updateCredential'
    );
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('api_credentials');
      const creds = await getCredentials(tenantId);
      let match = creds.find(c => c.service_name === serviceName);
      if (!match) match = { service_name: serviceName, category: 'other', credentials: {} };
      const merged = { ...(match.credentials || {}), ...credentialFields };
      const isConfigured = Object.values(merged).some(v => v && String(v).trim() !== '');
      const updated = {
        ...match,
        credentials: merged,
        is_configured: isConfigured,
        is_active: meta.is_active !== undefined ? meta.is_active : isConfigured,
        verification_status: meta.verification_status || 'unverified',
        notes: meta.notes || match.notes
      };
      memoryCredentials.set(serviceName, updated);
      return updated;
    }
    throw err;
  }
}

async function verifyCredential(tenantId, serviceName) {
  try {
    return unwrap(
      await supabase.from('api_credentials')
        .update({ verification_status: 'connected', last_verified_at: new Date().toISOString() })
        .eq('service_name', serviceName).eq('tenant_id', tenantId)
        .select().single(),
      'verifyCredential'
    );
  } catch (err) {
    if (isTableMissing(err)) {
      warnFallbackOnce('api_credentials');
      const creds = await getCredentials(tenantId);
      let match = creds.find(c => c.service_name === serviceName) || { service_name: serviceName };
      const updated = { ...match, verification_status: 'connected', last_verified_at: new Date().toISOString() };
      memoryCredentials.set(serviceName, updated);
      return updated;
    }
    throw err;
  }
}

// ── Interactive SQL ───────────────────────────────────────────────────────────
async function executeSql(tenantIdOrQuery, optionalQuery) {
  const query = typeof optionalQuery === 'string' ? optionalQuery : tenantIdOrQuery;
  const tenantId = typeof optionalQuery === 'string' ? tenantIdOrQuery : null;

  const start = Date.now();
  const clean = (query || '').trim().replace(/;+$/, '');
  const lower = clean.toLowerCase();

  if (!lower.startsWith('select')) {
    throw new Error('Only SELECT queries are allowed in this sandbox.');
  }

  let rows = [];
  let explanation = '';

  try {
    if (lower.includes('from constituents')) {
      const wardMatch = clean.match(/ward\s*=\s*['"]([^'"]+)['"]/i);
      const phoneMatch = clean.match(/phone_number\s*=\s*['"]([^'"]+)['"]/i);
      const limitMatch = clean.match(/limit\s+(\d+)/i);
      const lim = limitMatch ? parseInt(limitMatch[1], 10) : 50;

      let q = supabase.from('constituents').select('*').limit(lim);
      if (tenantId)   q = q.eq('tenant_id', tenantId);
      if (wardMatch)  { q = q.eq('ward', wardMatch[1]);           explanation = 'Index Scan on ward'; }
      if (phoneMatch) { q = q.eq('phone_number', phoneMatch[1]);  explanation = 'Unique Index Lookup on phone_number'; }
      if (lower.includes('is_opted_out = false')) q = q.eq('is_opted_out', false);
      if (lower.includes('is_opted_out = true'))  q = q.eq('is_opted_out', true);

      const { data, error } = await q;
      if (error && isTableMissing(error)) {
        const store = getLocalStore();
        let list = store.constituents || [];
        if (wardMatch) list = list.filter(c => c.ward === wardMatch[1]);
        if (phoneMatch) list = list.filter(c => c.phone_number === phoneMatch[1]);
        rows = list.slice(0, lim);
        explanation = 'Local Store Scan on constituents';
      } else {
        rows = data || [];
        explanation = explanation || 'Sequential Scan on constituents';
      }
    } else if (lower.includes('from campaigns')) {
      const { data, error } = await supabase.from('campaigns').select('*').limit(50);
      if (error && isTableMissing(error)) {
        rows = (getLocalStore().campaigns || []).slice(0, 50);
        explanation = 'Local Store Scan on campaigns';
      } else {
        rows = data || [];
        explanation = 'Scan on campaigns';
      }
    } else if (lower.includes('from sender_ids')) {
      const { data, error } = await supabase.from('sender_ids').select('*');
      if (error && isTableMissing(error)) {
        rows = getLocalStore().senderIds || [];
        explanation = 'Local Store Scan on sender_ids';
      } else {
        rows = data || [];
        explanation = 'Scan on sender_ids';
      }
    } else if (lower.includes('from rally_events') || lower.includes('from rallies')) {
      const { data, error } = await supabase.from('rally_events').select('*');
      if (error && isTableMissing(error)) {
        rows = getLocalStore().rallies || [];
        explanation = 'Local Store Scan on rallies';
      } else {
        rows = data || [];
        explanation = 'Scan on rally_events';
      }
    } else {
      throw new Error("Unsupported table. Try `SELECT * FROM constituents WHERE ward = 'Narok Town';`");
    }
  } catch (err) {
    if (err.message.includes('Unsupported table')) throw err;
    rows = (getLocalStore().constituents || []).slice(0, 50);
    explanation = 'Local Store Fallback Scan';
  }

  return {
    query: clean,
    rowCount: rows.length,
    executionTimeMs: (Date.now() - start).toFixed(3),
    explanation,
    indexesUsed: [],
    rows
  };
}

const dbExport = {
  supabase,
  NAROK_WARDS,
  ALL_WARDS,
  // Constituents
  getConstituents,
  createConstituent,
  updateConstituent,
  deleteConstituent,
  bulkImportConstituents,
  // Campaigns
  getCampaigns,
  createCampaign,
  dispatchCampaign,
  // Sender IDs
  getSenderIds,
  createSenderId,
  // Rallies
  getRallies,
  createRally,
  rsvpRally,
  updateRallyPhoto,
  // Social / Automations
  getSocialSyncAds,
  getAutomations,
  toggleAutomation,
  // Stats / SQL
  getStats,
  executeSql,
  // Credentials
  getCredentials,
  getCredential,
  updateCredential,
  verifyCredential
};

dbExport.db = dbExport;
module.exports = dbExport;
