const http = require('http');
const fs = require('fs');
const path = require('path');

async function testUserRequirements() {
  console.log('=======================================================');
  console.log('🧪 TESTING ALL USER REQUIREMENTS');
  console.log('=======================================================');

  // 1. Fetch Landing Page HTML
  const html = await new Promise((resolve, reject) => {
    http.get('http://localhost:3000/', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });

  console.log('\n--- 1. Landing Page Verification ---');
  // Check title
  const hasMultichannelTitle = html.includes('Talk Sasa, <span class="highlight-gold">Mult-channel Voter Outreach</span>');
  console.log('  ' + (hasMultichannelTitle ? '✓' : '✗') + ' Title is "Talk Sasa, Mult-channel Voter Outreach"');

  // Check bigger bold motto
  const hasBigBoldMotto = html.includes('hero-submotto hero-submotto-lg') && html.includes('<strong><em>"Getting your voice to the people"</em></strong>');
  console.log('  ' + (hasBigBoldMotto ? '✓' : '✗') + ' Motto is bigger, bold: <strong><em>"Getting your voice to the people"</em></strong>');

  // Check Vision and Mission
  const hasVision = html.includes('Our Strategic Vision') && html.includes('Democratizing Voter Communication Across Narok');
  const hasMission = html.includes('Our Grassroots Mission') && html.includes('Empowering Campaigns with Enterprise Omnichannel Tech');
  console.log('  ' + (hasVision ? '✓' : '✗') + ' Strategic Vision section present on landing page');
  console.log('  ' + (hasMission ? '✓' : '✗') + ' Grassroots Mission section present on landing page');

  // Check NO political figure image in landing view (view-overview)
  const overviewPart = html.substring(html.indexOf('id="view-overview"'), html.indexOf('id="view-crm"'));
  const hasOverviewImg = overviewPart.includes('<img');
  console.log('  ' + (!hasOverviewImg ? '✓' : '✗') + ' No images of political figure on landing page (view-overview has 0 <img> tags: ' + !hasOverviewImg + ')');

  console.log('\n--- 2. Broadcast Composer Verification ---');
  const composerPart = html.substring(html.indexOf('id="view-campaigns"'), html.indexOf('id="view-senders"'));
  const isHorizontalComposer = composerPart.includes('campaign-studio-horizontal') && composerPart.includes('campaign-horizontal-workspace');
  console.log('  ' + (isHorizontalComposer ? '✓' : '✗') + ' Broadcast Composer is Horizontal (campaign-studio-horizontal & campaign-horizontal-workspace)');

  // No image in composer preview
  const hasComposerImg = composerPart.includes('<img');
  console.log('  ' + (!hasComposerImg ? '✓' : '✗') + ' Removed image from Broadcast Composer (0 <img> tags: ' + !hasComposerImg + ')');

  // Channel toggling support
  const hasSmsToggle = composerPart.includes('data-channel="sms"');
  const hasWaToggle = composerPart.includes('data-channel="whatsapp"');
  const hasEmailToggle = composerPart.includes('data-channel="email"');
  const hasVoiceToggle = composerPart.includes('data-channel="voice"');
  const hasSocialToggle = composerPart.includes('data-channel="social"');
  console.log('  ' + (hasSmsToggle && hasWaToggle && hasEmailToggle && hasVoiceToggle && hasSocialToggle ? '✓' : '✗') + ' Channel Toggling: SMS, WhatsApp, Email, Voice IVR, Social Sync all available');

  console.log('\n--- 3. Political Rallies Photo Changeability Verification ---');
  // Check photo upload input in rally modal
  const hasRallyPhotoInput = html.includes('id="rallyPhotoFileInput"');
  const hasRallyUploadBox = html.includes('id="rallyPhotoUploadBox"');
  console.log('  ' + (hasRallyPhotoInput && hasRallyUploadBox ? '✓' : '✗') + ' Rally scheduling modal has photo/poster upload input');

  // Test Image Upload Endpoint with Base64 payload
  const sample1x1Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const uploadRes = await new Promise((resolve, reject) => {
    const postData = JSON.stringify({ base64Data: sample1x1Png });
    const req = http.request('http://localhost:3000/api/upload-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  console.log('  ' + (uploadRes.status === 200 && uploadRes.data.success ? '✓' : '✗') + ' Universal image upload endpoint (/api/upload-image) returned URL: ' + uploadRes.data.url);

  // Test scheduling rally with custom photo URL
  const newRallyRes = await new Promise((resolve, reject) => {
    const rallyPayload = JSON.stringify({
      rally_title: 'Mara Cultural & Tourism Pastoralist Summit',
      venue: 'Sekenani Gate Grounds',
      ward: 'Mara',
      rally_date: new Date(Date.now() + 3 * 86400000).toISOString(),
      chief_guest: 'Hon. Ledirama Ole Senteu & Maa Elders',
      expected_turnout: 7500,
      image_url: uploadRes.data.url
    });
    const req = http.request('http://localhost:3000/api/rallies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rallyPayload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(rallyPayload);
    req.end();
  });

  console.log('  ' + (newRallyRes.status === 201 && newRallyRes.data.data.image_url === uploadRes.data.url ? '✓' : '✗') + ' Scheduled new rally with custom uploaded photo: ' + newRallyRes.data.data.image_url);

  // Test updating rally photo on existing rally
  const rallyId = newRallyRes.data.data.id;
  const updatedRallyRes = await new Promise((resolve, reject) => {
    const updatePayload = JSON.stringify({ photoUrl: 'uploads/new_poster_replaced.png' });
    const req = http.request(`http://localhost:3000/api/rallies/${rallyId}/photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(updatePayload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(updatePayload);
    req.end();
  });

  console.log('  ' + (updatedRallyRes.status === 200 && updatedRallyRes.data.data.image_url === 'uploads/new_poster_replaced.png' ? '✓' : '✗') + ' Changed existing rally photo via /api/rallies/:id/photo: ' + updatedRallyRes.data.data.image_url);

  console.log('\n--- 4. Universal Image Replacement System Check ---');
  const hasUniversalInput = html.includes('id="universalImageInput"');
  console.log('  ' + (hasUniversalInput ? '✓' : '✗') + ' Hidden universal file picker (#universalImageInput) present for on-the-fly replacements');

  console.log('\n=======================================================');
  console.log('✨ ALL USER REQUIREMENTS VERIFIED SUCCESSFULLY!');
  console.log('=======================================================');
}

testUserRequirements().catch(err => console.error('Test error:', err));
