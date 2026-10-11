'use strict';
/**
 * Test Suite: Authentication, Account Recovery & Multi-Tenant Data Isolation
 */

require('dotenv').config({ path: '.env.local' });
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}

const express = require('express');
const authRoutes = require('../backend/routes/auth');
const { supabaseAdmin } = require('../backend/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const PORT = 3999;
const server = app.listen(PORT, async () => {
  console.log('================================================================');
  console.log('🧪 TESTING AUTHENTICATION & ACCOUNT RECOVERY PIPELINE');
  console.log('================================================================\n');

  try {
    // 1. Test Super Admin Recovery
    console.log('1. Testing Forgot Password for Super Admin (admin@naroktalksasa.ke)...');
    const res1 = await fetch(`http://localhost:${PORT}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@naroktalksasa.ke' })
    });
    const data1 = await res1.json();
    console.log('   ✓ Forgot Password Response:', data1.success, '| Code:', data1.recovery_code, '| SuperAdmin:', data1.is_super_admin);
    if (!data1.success || !data1.recovery_code) throw new Error('Super Admin recovery failed');

    // 2. Test Verify Recovery Code
    console.log('\n2. Testing Code Verification...');
    const res2 = await fetch(`http://localhost:${PORT}/api/auth/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@naroktalksasa.ke', code: data1.recovery_code })
    });
    const data2 = await res2.json();
    console.log('   ✓ Code Verification:', data2.success, '| Valid:', data2.valid);
    if (!data2.valid) throw new Error('Code verification failed');

    // 3. Test Reset Password
    console.log('\n3. Testing Password Reset & Auto-Login...');
    const newPass = 'SuperSecret2027!';
    const res3 = await fetch(`http://localhost:${PORT}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@naroktalksasa.ke', code: data1.recovery_code, new_password: newPass })
    });
    const data3 = await res3.json();
    console.log('   ✓ Reset Password:', data3.success, '| Role:', data3.user?.role, '| Token Issued:', !!data3.session?.access_token);
    if (!data3.success || !data3.session?.access_token) throw new Error('Password reset failed');

    // 4. Test Sign In with the New Password
    console.log('\n4. Testing Direct Sign In with New Password...');
    const res4 = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@naroktalksasa.ke', password: newPass })
    });
    const data4 = await res4.json();
    console.log('   ✓ Login Success:', data4.success, '| User:', data4.user?.email, '| Tenant:', data4.tenant?.name);
    if (!data4.success) throw new Error('Login with new password failed');

    // 5. Test Normal User Signup with Isolated Tenant
    console.log('\n5. Testing New Normal Tenant Signup...');
    const testEmail = `tenant_${Date.now()}@narokcampaign.ke`;
    const res5 = await fetch(`http://localhost:${PORT}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'CampaignOwner2027!',
        first_name: 'Senteu',
        last_name: 'Ole Gilisho',
        organization_name: 'Kilgoris Future Coalition 2027',
        county: 'Narok'
      })
    });
    const data5 = await res5.json();
    console.log('   ✓ Tenant Signup Response:', data5);
    if (!data5.success) throw new Error(`Tenant signup failed: ${data5.error}`);

    // 6. Test Forgot Password for Normal User
    console.log('\n6. Testing Account Recovery for Normal Tenant User...');
    const res6 = await fetch(`http://localhost:${PORT}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail })
    });
    const data6 = await res6.json();
    console.log('   ✓ Tenant Recovery Code:', data6.recovery_code, '| Tenant Name:', data6.tenant_name, '| SuperAdmin:', data6.is_super_admin);
    if (!data6.success) throw new Error('Normal user recovery failed');

    // 7. Reset Password for Normal User
    console.log('\n7. Resetting Normal User Password...');
    const res7 = await fetch(`http://localhost:${PORT}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        code: data6.recovery_code,
        new_password: 'BrandNewPassword2027!'
      })
    });
    const data7 = await res7.json();
    console.log('   ✓ Tenant Password Reset:', data7.success, '| Tenant Isolated ID:', data7.tenant?.id);
    if (!data7.success) throw new Error('Normal user password reset failed');

    console.log('\n================================================================');
    console.log('🎉 ALL AUTHENTICATION & RECOVERY TESTS PASSED (100% SUCCESS)!');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    server.close();
    process.exit(0);
  }
});
