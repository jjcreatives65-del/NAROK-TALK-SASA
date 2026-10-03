'use strict';

/**
 * Talk Sasa - Direct PostgreSQL Migration Runner
 * 
 * Executes the SQL migration script directly to Supabase PostgreSQL.
 * Usage:
 *   node scripts/apply_migration_direct.js <db_password>
 *   OR set DATABASE_URL / POSTGRES_PASSWORD in .env.local
 */

try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
} catch (_) {}

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const projectRef = 'pqkgkfgvwlsvcwjkptoy';
const password = process.argv[2] || process.env.POSTGRES_PASSWORD || process.env.SUPABASE_DB_PASSWORD;

if (!password && !process.env.DATABASE_URL) {
  console.error('================================================================');
  console.error('❌ Database Password / Connection String Required');
  console.error('================================================================');
  console.error('Usage: node scripts/apply_migration_direct.js <password>');
  process.exit(1);
}

const migrationFile = path.resolve(__dirname, '../supabase/migrations/20261003000000_talk_sasa_phase1_foundation.sql');
if (!fs.existsSync(migrationFile)) {
  console.error(`❌ Migration file not found: ${migrationFile}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationFile, 'utf8');

async function runDirectMigration() {
  console.log('================================================================');
  console.log('TALK SASA — DIRECT POSTGRESQL MIGRATION RUNNER');
  console.log(`Connecting to: aws-0-eu-central-1.pooler.supabase.com:6543 (${projectRef})`);
  console.log('================================================================\n');

  // Supabase connection config with SSL rejectUnauthorized: false to allow self-signed proxy certs
  const config = process.env.DATABASE_URL 
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: 'aws-0-eu-central-1.pooler.supabase.com',
        port: 6543,
        user: `postgres.${projectRef}`,
        password: password,
        database: 'postgres',
        ssl: { rejectUnauthorized: false }
      };

  const client = new Client(config);

  try {
    await client.connect();
    console.log('🔌 Connected to PostgreSQL successfully!\n');
    console.log('🚀 Executing migration script (20261003000000_talk_sasa_phase1_foundation.sql)...');

    const startTime = Date.now();
    await client.query(sql);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n🎉 Migration successfully applied in ${duration}s!`);
    console.log('   ✓ Enums: tenant_type, subscription_status, user_role, campaign_type, campaign_status, social_platform');
    console.log('   ✓ Core Tables: tenants, user_profiles, contacts, campaigns, social_integrations, stream_keys');
    console.log('   ✓ Backward compatibility: constituents view mapped to contacts');
    console.log('   ✓ High-Performance 400k+ Indexes created');
    console.log('   ✓ In-Memory RLS functions & JWT claim hooks configured');
    console.log('   ✓ Strict Row-Level Security (RLS) policies enforced');
    console.log('   ✓ Anchor tenant seeded');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ Error during PostgreSQL execution:');
    console.error(err.message);
    if (err.position) {
      console.error(`Position: ${err.position}`);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

runDirectMigration();
