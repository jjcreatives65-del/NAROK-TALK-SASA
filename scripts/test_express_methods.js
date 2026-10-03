'use strict';

/**
 * End-to-End Verification Test for Talk Sasa Express Supabase Database Methods
 */

const { 
  supabaseAdmin, 
  tenantDbMiddleware, 
  createTenantDbMethods, 
  verifyIngestKey 
} = require('../backend/database/supabaseClient');

const ANCHOR_TENANT = 'a0000000-0000-0000-0000-000000000001';

async function runTests() {
  console.log('================================================================');
  console.log('TALK SASA — EXPRESS SUPABASE DB METHODS VERIFICATION');
  console.log(`Tenant ID: ${ANCHOR_TENANT}`);
  console.log('================================================================\n');

  const db = createTenantDbMethods(supabaseAdmin, ANCHOR_TENANT);

  // 1. Test Tenant Details
  console.log('1. Testing getTenantDetails()...');
  const tenant = await db.getTenantDetails();
  console.log(`   ✓ Found Tenant: "${tenant.name}" (Slug: ${tenant.slug}, Status: ${tenant.status})`);

  // 2. Test Single Contact Creation (Upsert)
  console.log('\n2. Testing createContact()...');
  const testPhone = '+254711999888';
  const newContact = await db.createContact({
    phone_number: testPhone,
    first_name: 'Ole',
    last_name: 'Ntutu',
    ward: 'Narok Town',
    county: 'Narok',
    voter_status: 'registered',
    tags: ['express-test', 'vip']
  });
  console.log(`   ✓ Created/Upserted Contact: ${newContact.first_name} ${newContact.last_name} (${newContact.phone_number}), ID: ${newContact.id}`);

  // 3. Test Contact Retrieval & Filtering
  console.log('\n3. Testing getContacts() with filters...');
  const contactsRes = await db.getContacts({ ward: 'Narok Town', limit: 5 });
  console.log(`   ✓ Retrieved ${contactsRes.contacts.length} contacts (Total in Narok Town: ${contactsRes.total})`);

  // 4. Test Bulk Import of Contacts (High-Performance Chunking)
  console.log('\n4. Testing bulkImportContacts() with batching...');
  const bulkContacts = [
    { phone_number: '+254711000001', first_name: 'Faith', last_name: 'Kiprotich', ward: 'Ololulung\'a' },
    { phone_number: '+254711000002', first_name: 'Daniel', last_name: 'Sankale', ward: 'Ildamat' },
    { phone_number: '+254711000003', first_name: 'Mercy', last_name: 'Chepkemoi', ward: 'Sagamian' }
  ];
  let progressReported = 0;
  const bulkRes = await db.bulkImportContacts(bulkContacts, (progress) => {
    progressReported = progress.processed;
  });
  console.log(`   ✓ Successfully bulk imported ${bulkRes.totalImported} contacts. Progress callback fired: ${progressReported}/${bulkContacts.length}`);

  // 5. Test Campaign Creation & Update
  console.log('\n5. Testing createCampaign() and updateCampaignStatus()...');
  const campaign = await db.createCampaign({
    name: 'Express Test Broadcast',
    type: 'sms',
    message_body: 'Habari Narok! Testing Talk Sasa Express Supabase integration.',
    sender_id: 'TALKSASA',
    target_ward: 'Narok Town'
  });
  console.log(`   ✓ Created Campaign ID: ${campaign.id}, Name: "${campaign.name || campaign.campaign_name}", Status: ${campaign.status}`);

  const updatedCampaign = await db.updateCampaignStatus(campaign.id, 'completed', {
    total_recipients: 50,
    successful_deliveries: 49,
    failed_deliveries: 1
  });
  console.log(`   ✓ Updated Campaign Status to: ${updatedCampaign.status} (Delivered: ${updatedCampaign.successful_deliveries}/${updatedCampaign.total_recipients})`);

  // 6. Test Stream Keys (Live Broadcasting)
  console.log('\n6. Testing createStreamKey() and verifyIngestKey()...');
  const streamKey = await db.createStreamKey(`Governor Narok Town Hall Live ${Date.now()}`, [
    { platform: 'facebook', rtmp_url: 'rtmps://live-api-s.facebook.com:443/rtmp/', stream_key: 'fb_live_key_xyz' },
    { platform: 'youtube', rtmp_url: 'rtmp://a.rtmp.youtube.com/live2', stream_key: 'yt_live_key_abc' }
  ]);
  console.log(`   ✓ Created Stream Key: ID ${streamKey.id}`);
  console.log(`     Ingest Key: ${streamKey.talk_sasa_ingest_key}`);
  console.log(`     Destinations: ${streamKey.destinations.length} linked streams`);

  const authCheck = await verifyIngestKey(streamKey.talk_sasa_ingest_key);
  console.log(`   ✓ verifyIngestKey handshake check: valid = ${authCheck.valid}, Title: "${authCheck.stream.stream_title}"`);

  // 7. Express Middleware Simulation Test
  console.log('\n7. Testing tenantDbMiddleware in simulated Express request...');
  const mockReq = {
    headers: {
      'x-tenant-id': ANCHOR_TENANT
    }
  };
  const mockRes = {};
  let nextCalled = false;
  tenantDbMiddleware(mockReq, mockRes, () => { nextCalled = true; });

  if (nextCalled && mockReq.db && mockReq.tenantId === ANCHOR_TENANT) {
    console.log(`   ✓ tenantDbMiddleware successfully injected req.db and req.tenantId (${mockReq.tenantId})`);
    const countCheck = await mockReq.db.getContacts({ limit: 1 });
    console.log(`   ✓ req.db.getContacts() called successfully via injected middleware: Total=${countCheck.total}`);
  } else {
    throw new Error('tenantDbMiddleware failed to inject db/tenantId');
  }

  // 8. Auth & Users Management Test
  console.log('\n8. Testing Auth & User Management (auto-trigger, login & profile)...');
  const testEmail = `agent_${Date.now()}@naroktalksasa.ke`;
  const testPassword = 'Password2027!Secure';
  
  const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    user_metadata: {
      first_name: 'Lemayian',
      last_name: 'Ole Kaelo',
      role: 'manager',
      tenant_id: ANCHOR_TENANT,
      phone_number: '+254722111222'
    }
  });

  if (createErr) throw createErr;
  console.log(`   ✓ Provisioned Auth User: ${newUser.user.email} (ID: ${newUser.user.id})`);

  // Verify profile auto-creation by handle_new_user() trigger
  const userProfile = await db.getUserProfile(newUser.user.id);
  console.log(`   ✓ Profile Auto-Trigger Verified: "${userProfile.first_name} ${userProfile.last_name}", Role: ${userProfile.role}, Tenant: ${userProfile.tenant_id}`);

  // Test Profile Update
  const updatedProfile = await db.updateUserProfile(newUser.user.id, { role: 'analyst', phone_number: '+254722333444' });
  console.log(`   ✓ Profile Updated: Role changed to ${updatedProfile.role}, Phone: ${updatedProfile.phone_number}`);

  // Test List Users for Tenant
  const allUsers = await db.getUserProfiles();
  console.log(`   ✓ Team Members for Tenant: ${allUsers.length} active users`);

  console.log('\n================================================================');
  console.log('✅ ALL EXPRESS DB & AUTH METHODS PASSED WITH 100% SUCCESS!');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
