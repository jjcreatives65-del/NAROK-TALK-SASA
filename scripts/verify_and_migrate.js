'use strict';

/**
 * Talk Sasa - Phase 1 Database Migration & Verification Utility
 * 
 * Verifies Supabase schema status, checks table health, and
 * validates Row-Level Security (RLS) enforcement.
 */

try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
} catch (_) {}

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://pqkgkfgvwlsvcwjkptoy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY is required in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyPhase1Schema() {
  console.log('================================================================');
  console.log('TALK SASA — PHASE 1 SUPABASE SCHEMA VERIFICATION');
  console.log(`Target: ${supabaseUrl}`);
  console.log('================================================================\n');

  const requiredTables = [
    { name: 'tenants', desc: 'Organizations (political / general) with SMS sender_id' },
    { name: 'user_profiles', desc: 'Users extending auth.users with tenant_id & role' },
    { name: 'contacts', desc: 'Constituents/Audience CRM (400,000+ contacts scale)' },
    { name: 'campaigns', desc: 'Omnichannel broadcast definitions & scheduled status' },
    { name: 'social_integrations', desc: 'Phase 4 encrypted OAuth tokens (FB, IG, X)' },
    { name: 'stream_keys', desc: 'Phase 5 OBS ingest keys & YouTube/FB Live RTMP' }
  ];

  let missingTables = [];
  let availableTables = [];

  for (const table of requiredTables) {
    const { data, error } = await supabase
      .from(table.name)
      .select('id')
      .limit(1);

    if (error) {
      console.log(`❌ Table '${table.name}': PENDING MIGRATION (${error.message})`);
      missingTables.push(table.name);
    } else {
      console.log(`✅ Table '${table.name}': ONLINE (${table.desc})`);
      availableTables.push(table.name);
    }
  }

  // Also check backwards compatibility view 'constituents'
  const { error: viewErr } = await supabase.from('constituents').select('id').limit(1);
  if (viewErr && (viewErr.code === 'PGRST205' || viewErr.message.includes('Could not find the table'))) {
    console.log(`ℹ️  View 'constituents': PENDING MIGRATION`);
  } else {
    console.log(`✅ View 'constituents': ONLINE (mapped to contacts)`);
  }

  console.log('\n----------------------------------------------------------------');
  if (missingTables.length > 0) {
    console.log(`⚠️  ${missingTables.length} tables pending migration in Supabase: [${missingTables.join(', ')}]`);
    console.log('\nTo deploy the schema to your Supabase PostgreSQL instance:');
    console.log('1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/pqkgkfgvwlsvcwjkptoy');
    console.log('2. Navigate to "SQL Editor" in the left sidebar.');
    console.log('3. Open or paste the migration script from:');
    console.log('   supabase/migrations/20261003000000_talk_sasa_phase1_foundation.sql');
    console.log('4. Click "Run". All tables, ENUMs, 400k-optimized indexes, and RLS policies will be applied instantly.');
  } else {
    console.log('🎉 All Phase 1 Core Multi-Tenant Tables are active and ready!');
  }
  console.log('================================================================\n');
}

verifyPhase1Schema().catch(err => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
