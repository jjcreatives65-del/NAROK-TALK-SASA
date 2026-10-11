/**
 * Talk Sasa — Authentication & Multi-Tenant Session Controller
 * Manages:
 * 1. User login, signup, and 1-Click 7-Day Free Demo onboarding
 * 2. Token persistence and automatic session refresh
 * 3. Super Admin role detection and portal visibility
 * 4. 7-Day Demo Countdown pill and expiry alerts
 * 5. Tenant switching for Super Admins
 */
(function() {
  'use strict';

  let currentUser = null;
  let currentProfile = null;
  let currentTenant = null;
  let currentToken = localStorage.getItem('TALK_SASA_AUTH_TOKEN') || null;

  // ── Session Init ─────────────────────────────────────────────────────────────
  async function initSession() {
    renderAuthHeader();

    if (currentToken) {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.success) {
          currentUser = data.user;
          currentProfile = data.profile;
          currentTenant = data.tenant;
          if (data.tenant?.id) {
            localStorage.setItem('TALK_SASA_ACTIVE_TENANT_ID', data.tenant.id);
          }
          renderAuthHeader();
          checkSuperAdminAccess();
          renderDemoCountdown();
          return;
        }
      } catch (err) {
        console.warn('Session verification fallback:', err.message);
      }
    }

    // Default local demo fallback if no token
    renderAuthHeader();
  }

  // ── Render Top Bar Header Badges ─────────────────────────────────────────────
  function renderAuthHeader() {
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions) return;

    let authContainer = document.getElementById('headerAuthContainer');
    if (!authContainer) {
      authContainer = document.createElement('div');
      authContainer.id = 'headerAuthContainer';
      authContainer.style.display = 'inline-flex';
      authContainer.style.alignItems = 'center';
      authContainer.style.gap = '0.5rem';
      // Insert before theme toggle
      const themeBtn = document.getElementById('themeToggleBtn');
      if (themeBtn) {
        headerActions.insertBefore(authContainer, themeBtn);
      } else {
        headerActions.appendChild(authContainer);
      }
    }

    if (currentUser) {
      const isSuper = currentUser.role === 'super_admin';
      const isDemo = currentTenant?.demo_status?.is_demo;
      const roleLabel = isSuper ? 'SUPER ADMIN' : (isDemo ? 'DEMO USER' : (currentUser.role || 'MEMBER').toUpperCase());
      const roleBadgeClass = isSuper ? 'badge-super-admin' : (isDemo ? 'badge-gold' : 'badge-emerald');
      const displayName = currentProfile?.first_name ? `${currentProfile.first_name} ${currentProfile.last_name || ''}`.trim() : (currentUser.email || 'User');
      const tenantName = currentTenant?.name || 'Workspace';

      authContainer.innerHTML = `
        <!-- Demo Banner if in trial -->
        ${isDemo ? renderDemoPillHtml(currentTenant.demo_status) : ''}

        <!-- Workspace & Profile Pill -->
        <div class="user-profile-pill" id="userProfilePill" onclick="window.AuthManager.openAccountDrawer()" title="Account & Workspace Settings">
          <div class="user-avatar-circle">${displayName.charAt(0).toUpperCase()}</div>
          <div class="user-info-text">
            <span class="user-name">${escapeHtml(displayName)}</span>
            <span class="user-org">🏢 ${escapeHtml(tenantName)}</span>
          </div>
          <span class="badge ${roleBadgeClass}" style="font-size:0.65rem; padding: 0.15rem 0.5rem;">${roleLabel}</span>
        </div>

        <!-- Super Admin Quick Button -->
        ${isSuper ? `
          <button class="btn btn-warning btn-sm" id="btnNavSuperAdmin" onclick="window.switchTab('admin')" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; font-weight: 700; border: none; box-shadow: 0 2px 8px rgba(245,158,11,0.3);">
            🛡️ Admin Console
          </button>
        ` : ''}

        <button class="btn btn-secondary btn-sm" onclick="window.AuthManager.logout()" title="Sign Out">
          Sign Out
        </button>
      `;
    } else {
      authContainer.innerHTML = `
        <button class="btn btn-primary btn-sm" onclick="window.AuthManager.openLoginModal('demo')" style="background: linear-gradient(135deg, #ffad00, #e69d00); color: #1e3f32; font-weight: 800; border: none; box-shadow: 0 2px 10px rgba(255,173,0,0.35);">
          ⚡ Start 7-Day Demo
        </button>
        <button class="btn btn-secondary btn-sm" onclick="window.AuthManager.openLoginModal('login')">
          Sign In
        </button>
      `;
    }
  }

  function renderDemoPillHtml(demoStatus) {
    if (!demoStatus) return '';
    if (demoStatus.is_expired) {
      return `
        <div class="demo-countdown-pill expired" onclick="window.AuthManager.openUpgradeModal()" title="7-Day Demo Period Ended">
          <span class="pulse-dot red"></span>
          <span>⚠️ DEMO EXPIRED</span>
          <button class="btn-upgrade-mini">Upgrade</button>
        </div>
      `;
    }
    const days = demoStatus.days_remaining ?? 6;
    const hours = demoStatus.hours_remaining ?? 23;
    return `
      <div class="demo-countdown-pill" onclick="window.AuthManager.openUpgradeModal()" title="Free 7-Day Demo: Full System Access with Platform Gateways">
        <span class="pulse-dot gold"></span>
        <span>⚡ 7-DAY DEMO: <strong>${days}d ${hours}h left</strong></span>
      </div>
    `;
  }

  function renderDemoCountdown() {
    // If demo is expired, check if we need to show warning banner in workspace
    if (currentTenant?.demo_status?.is_demo && currentTenant?.demo_status?.is_expired) {
      showDemoExpiredBanner();
    }
  }

  function showDemoExpiredBanner() {
    let banner = document.getElementById('demoExpiredGlobalBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'demoExpiredGlobalBanner';
      banner.className = 'demo-expired-banner';
      banner.innerHTML = `
        <div class="banner-content">
          <span>⚠️ <strong>Your 7-day demo trial period has ended.</strong> To continue launching SMS, WhatsApp, and Voice broadcasts, upgrade your plan or connect your custom API keys.</span>
          <button class="btn btn-primary btn-sm" onclick="window.switchTab('credentials')">Connect API Keys</button>
          <button class="btn btn-gold btn-sm" onclick="window.AuthManager.openUpgradeModal()">Upgrade Workspace</button>
        </div>
      `;
      const main = document.querySelector('.main-content');
      if (main) main.insertBefore(banner, main.firstChild);
    }
  }

  function checkSuperAdminAccess() {
    const adminNavBtn = document.querySelector('[data-target="admin"]');
    if (adminNavBtn) {
      if (currentUser?.role === 'super_admin') {
        adminNavBtn.style.display = 'inline-flex';
      } else {
        adminNavBtn.style.display = 'none';
      }
    }
  }

  // ── Authentication Actions ──────────────────────────────────────────────────
  async function login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Login failed.');
    }

    localStorage.setItem('TALK_SASA_AUTH_TOKEN', data.session.access_token);
    if (data.tenant?.id) {
      localStorage.setItem('TALK_SASA_ACTIVE_TENANT_ID', data.tenant.id);
    }
    currentToken = data.session.access_token;
    currentUser = data.user;
    currentProfile = data.profile;
    currentTenant = data.tenant;

    renderAuthHeader();
    checkSuperAdminAccess();
    closeAuthModal();

    if (window.showToast) window.showToast(`Welcome back, ${currentUser.email}!`, 'success');
    if (window.reloadDashboard) window.reloadDashboard();
    return data;
  }

  async function signup(formData) {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Signup failed.');
    }

    if (data.session?.access_token) {
      localStorage.setItem('TALK_SASA_AUTH_TOKEN', data.session.access_token);
      currentToken = data.session.access_token;
    }
    if (data.tenant?.id) {
      localStorage.setItem('TALK_SASA_ACTIVE_TENANT_ID', data.tenant.id);
    }
    currentUser = data.user;
    currentProfile = data.profile;
    currentTenant = data.tenant;

    renderAuthHeader();
    checkSuperAdminAccess();
    closeAuthModal();

    if (window.showToast) window.showToast('Workspace registered successfully!', 'success');
    if (window.reloadDashboard) window.reloadDashboard();
    return data;
  }

  async function startDemo(formData) {
    const res = await fetch('/api/auth/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Demo creation failed.');
    }

    if (data.session?.access_token) {
      localStorage.setItem('TALK_SASA_AUTH_TOKEN', data.session.access_token);
      currentToken = data.session.access_token;
    }
    if (data.tenant?.id) {
      localStorage.setItem('TALK_SASA_ACTIVE_TENANT_ID', data.tenant.id);
    }
    currentUser = data.user;
    currentProfile = data.profile;
    currentTenant = data.tenant;

    renderAuthHeader();
    checkSuperAdminAccess();
    closeAuthModal();

    if (window.showToast) window.showToast('🎉 7-Day Demo Activated! Full system access enabled with Platform Gateways.', 'success');
    if (window.reloadDashboard) window.reloadDashboard();
    return data;
  }

  function logout() {
    localStorage.removeItem('TALK_SASA_AUTH_TOKEN');
    localStorage.removeItem('TALK_SASA_ACTIVE_TENANT_ID');
    currentToken = null;
    currentUser = null;
    currentProfile = null;
    currentTenant = null;

    const banner = document.getElementById('demoExpiredGlobalBanner');
    if (banner) banner.remove();

    renderAuthHeader();
    checkSuperAdminAccess();
    if (window.showToast) window.showToast('Signed out successfully.', 'info');
    setTimeout(() => window.location.reload(), 400);
  }

  // ── Super Admin Tenant Switcher ─────────────────────────────────────────────
  function switchTenant(tenantId, tenantName) {
    localStorage.setItem('TALK_SASA_ACTIVE_TENANT_ID', tenantId);
    if (currentTenant) {
      currentTenant.id = tenantId;
      if (tenantName) currentTenant.name = tenantName;
    }
    renderAuthHeader();
    if (window.showToast) window.showToast(`Switched active workspace to: ${tenantName || tenantId}`, 'success');
    if (window.reloadDashboard) window.reloadDashboard();
    setTimeout(() => window.location.reload(), 500);
  }

  // ── Auth Modal UI ───────────────────────────────────────────────────────────
  function openLoginModal(initialTab = 'login') {
    let modal = document.getElementById('authModal');
    if (!modal) {
      modal = createAuthModalElement();
      document.body.appendChild(modal);
    }
    switchAuthTab(initialTab);
    modal.classList.add('active');
  }

  function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('active');
  }

  function switchAuthTab(tab) {
    const tabs = ['login', 'signup', 'demo', 'recover'];
    tabs.forEach(t => {
      const btn = document.getElementById(`tabBtn_${t}`);
      const pane = document.getElementById(`tabPane_${t}`);
      if (btn) btn.classList.toggle('active', t === tab);
      if (pane) pane.classList.toggle('active', t === tab);
    });

    // Reset recovery step 1 when opening recovery tab
    if (tab === 'recover') {
      const s1 = document.getElementById('recoverStep1');
      const s2 = document.getElementById('recoverStep2');
      if (s1) s1.style.display = 'block';
      if (s2) s2.style.display = 'none';
      const err = document.getElementById('recoverErrorMsg');
      if (err) err.style.display = 'none';
    }
  }

  function fillAdminCredentials() {
    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPassword');
    if (emailInput) emailInput.value = 'admin@naroktalksasa.ke';
    if (passInput) passInput.focus();
    if (window.showToast) window.showToast('Super Admin email autofilled. Enter password or use Reset Key if forgotten.', 'info');
  }

  function createAuthModalElement() {
    const el = document.createElement('div');
    el.id = 'authModal';
    el.className = 'modal-backdrop';
    el.innerHTML = `
      <div class="modal-card auth-modal-card">
        <button class="modal-close-btn" onclick="window.AuthManager.closeModal()">&times;</button>
        
        <div class="auth-header">
          <div class="auth-brand-badge">TS</div>
          <h2>Talk Sasa Access Portal</h2>
          <p>Narok County Political Outreach & Omnichannel CRM</p>
        </div>

        <div class="auth-tabs-nav">
          <button id="tabBtn_login" class="auth-tab-btn active" onclick="window.AuthManager.switchTab('login')">Sign In</button>
          <button id="tabBtn_demo" class="auth-tab-btn" onclick="window.AuthManager.switchTab('demo')" style="color: #ffad00;">⚡ 7-Day Demo</button>
          <button id="tabBtn_signup" class="auth-tab-btn" onclick="window.AuthManager.switchTab('signup')">Register Org</button>
          <button id="tabBtn_recover" class="auth-tab-btn" onclick="window.AuthManager.switchTab('recover')">Reset Key</button>
        </div>

        <!-- 1. SIGN IN TAB -->
        <div id="tabPane_login" class="auth-tab-pane active">
          <form id="loginForm" onsubmit="window.AuthManager.handleLoginForm(event)">
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="loginEmail" class="form-control" placeholder="user@campaign.ke or admin@naroktalksasa.ke" required>
            </div>
            
            <div class="quick-admin-pill" onclick="window.AuthManager.fillAdminCredentials()" title="Click to autofill platform super admin email">
              🛡️ Quick Fill: Super Admin (admin@naroktalksasa.ke)
            </div>

            <div class="form-group">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <label>Password</label>
                <a href="#" onclick="window.AuthManager.switchTab('recover'); return false;" class="auth-link-subtle">Forgot Password?</a>
              </div>
              <input type="password" id="loginPassword" class="form-control" placeholder="••••••••" required>
            </div>
            
            <div id="loginErrorMsg" class="auth-error-msg" style="display:none;"></div>
            
            <button type="submit" class="btn btn-primary btn-block" id="btnLoginSubmit" style="font-weight: 700; padding: 0.75rem;">
              Sign In to Workspace
            </button>
            
            <div style="margin-top:1.25rem; text-align:center; font-size:0.75rem; color:#94a3b8;">
              Looking for quick evaluation? <a href="#" onclick="window.AuthManager.switchTab('demo'); return false;" class="auth-link-subtle">Start 7-Day Free Demo</a>
            </div>
          </form>
        </div>

        <!-- 2. 7-DAY DEMO TAB -->
        <div id="tabPane_demo" class="auth-tab-pane">
          <div class="demo-perks-box">
            <h4>⚡ Instant 7-Day Free Trial Includes:</h4>
            <ul>
              <li>✓ Full platform access across Narok's 30 wards</li>
              <li>✓ <strong>Pre-configured Platform API Keys</strong> for SMS, WhatsApp, & Voice testing</li>
              <li>✓ Sample voter contacts pre-loaded</li>
              <li>✓ No credit card or gateway setup required</li>
            </ul>
          </div>
          <form id="demoForm" onsubmit="window.AuthManager.handleDemoForm(event)">
            <div class="form-group">
              <label>Candidate / Campaign Name</label>
              <input type="text" id="demoCandidateName" class="form-control" placeholder="e.g. Lemayian Ole Kaelo" required>
            </div>
            <div class="form-group">
              <label>Organization / Seat</label>
              <input type="text" id="demoOrgName" class="form-control" placeholder="e.g. Narok North Parliamentary Campaign 2027">
            </div>
            <div class="form-group">
              <label>Contact Phone (WhatsApp / SMS)</label>
              <input type="tel" id="demoPhone" class="form-control" placeholder="+254712345678">
            </div>
            <div class="form-group">
              <label>Contact Email (Optional)</label>
              <input type="email" id="demoEmail" class="form-control" placeholder="you@campaign.ke">
            </div>
            <div id="demoErrorMsg" class="auth-error-msg" style="display:none;"></div>
            <button type="submit" class="btn btn-gold btn-block" id="btnDemoSubmit" style="font-weight: 800; padding: 0.75rem;">
              🚀 Launch 7-Day Full Access Demo
            </button>
          </form>
        </div>

        <!-- 3. SIGNUP TAB (Isolated Tenant Creation) -->
        <div id="tabPane_signup" class="auth-tab-pane">
          <form id="signupForm" onsubmit="window.AuthManager.handleSignupForm(event)">
            <div class="tenant-isolation-banner" style="margin-bottom: 1rem;">
              <div class="icon">🔒</div>
              <div class="text">
                <h5>Isolated Tenant Architecture</h5>
                <p>Creates dedicated workspace with PostgreSQL RLS data isolation.</p>
              </div>
            </div>

            <div class="form-group">
              <label>Organization / Coalition Name</label>
              <input type="text" id="signupOrgName" class="form-control" placeholder="e.g. Kilgoris Future Coalition 2027" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>County</label>
                <input type="text" id="signupCounty" class="form-control" value="Narok" required>
              </div>
              <div class="form-group">
                <label>Admin First Name</label>
                <input type="text" id="signupFirstName" class="form-control" placeholder="Ole" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Admin Last Name</label>
                <input type="text" id="signupLastName" class="form-control" placeholder="Ntutu" required>
              </div>
              <div class="form-group">
                <label>Admin Phone (+254...)</label>
                <input type="tel" id="signupPhone" class="form-control" placeholder="+254711999888">
              </div>
            </div>
            <div class="form-group">
              <label>Admin Email Address</label>
              <input type="email" id="signupEmail" class="form-control" placeholder="director@coalition.ke" required>
            </div>
            <div class="form-group">
              <label>Password (Min 6 chars)</label>
              <input type="password" id="signupPassword" class="form-control" placeholder="••••••••" minlength="6" required>
            </div>
            <div id="signupErrorMsg" class="auth-error-msg" style="display:none;"></div>
            <button type="submit" class="btn btn-primary btn-block" id="btnSignupSubmit" style="font-weight: 700; padding: 0.75rem;">
              Create Organization & Workspace
            </button>
          </form>
        </div>

        <!-- 4. RECOVERY TAB (Forgot Password / Reset Key) -->
        <div id="tabPane_recover" class="auth-tab-pane">
          <!-- Step 1: Request Recovery Code -->
          <div id="recoverStep1">
            <div style="text-align:center; margin-bottom: 1rem;">
              <span class="recovery-step-badge">Step 1 of 2: Verification</span>
              <h4 style="margin: 0.25rem 0; font-size: 1.1rem; color: #fff;">Reset Account Access</h4>
              <p style="margin: 0; font-size: 0.78rem; color: #94a3b8;">
                Available for Super Admins and Tenant Users with data isolation.
              </p>
            </div>
            <form id="recoverRequestForm" onsubmit="window.AuthManager.handleRecoverRequest(event)">
              <div class="form-group">
                <label>Registered Email Address</label>
                <input type="email" id="recoverEmail" class="form-control" placeholder="admin@naroktalksasa.ke or you@campaign.ke" required>
              </div>
              <div id="recoverRequestErrorMsg" class="auth-error-msg" style="display:none;"></div>
              <button type="submit" class="btn btn-warning btn-block" id="btnRecoverRequestSubmit" style="background: linear-gradient(135deg, #f59e0b, #d97706); font-weight: 700; padding: 0.75rem;">
                🔑 Send 6-Digit Recovery Code
              </button>
            </form>
          </div>

          <!-- Step 2: Enter Code & New Password -->
          <div id="recoverStep2" style="display:none;">
            <div style="text-align:center; margin-bottom: 1rem;">
              <span class="recovery-step-badge">Step 2 of 2: Set New Password</span>
              <h4 style="margin: 0.25rem 0; font-size: 1.1rem; color: #fff;">Verify & Reset</h4>
              <p id="recoverEmailBadge" style="margin: 0; font-size: 0.78rem; color: #ffad00; font-weight: 600;"></p>
            </div>

            <div id="recoverCodeAlertBox" class="demo-perks-box" style="display:none; text-align:center;">
              <span style="font-size: 0.75rem; color: #94a3b8;">Generated Verification Code:</span>
              <div id="recoverCodeDisplay" style="font-family:'JetBrains Mono',monospace; font-size:1.6rem; font-weight:900; letter-spacing:0.3rem; color:#ffad00; margin:0.25rem 0;"></div>
              <span style="font-size:0.7rem; color:#64748b;">Valid for 15 minutes. Enter below to reset.</span>
            </div>

            <form id="recoverResetForm" onsubmit="window.AuthManager.handleRecoverReset(event)">
              <div class="form-group">
                <label style="text-align:center; display:block;">Enter 6-Digit Code</label>
                <input type="text" id="recoverCode" class="form-control recovery-code-input" maxlength="6" placeholder="000000" required>
              </div>
              <div class="form-group">
                <label>New Password (Min 6 chars)</label>
                <input type="password" id="recoverNewPassword" class="form-control" placeholder="••••••••" minlength="6" required>
              </div>
              <div class="form-group">
                <label>Confirm New Password</label>
                <input type="password" id="recoverConfirmPassword" class="form-control" placeholder="••••••••" minlength="6" required>
              </div>
              <div id="recoverResetErrorMsg" class="auth-error-msg" style="display:none;"></div>
              <button type="submit" class="btn btn-primary btn-block" id="btnRecoverResetSubmit" style="font-weight: 700; padding: 0.75rem;">
                Set New Password & Sign In
              </button>
              <div style="text-align:center; margin-top: 0.75rem;">
                <a href="#" onclick="document.getElementById('recoverStep1').style.display='block'; document.getElementById('recoverStep2').style.display='none'; return false;" class="auth-link-subtle">
                  ← Back to Step 1
                </a>
              </div>
            </form>
          </div>
        </div>

      </div>
    `;
    return el;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }

  // ── Account Settings & Workspace Drawer ─────────────────────────────────────
  async function openAccountDrawer() {
    let modal = document.getElementById('accountSettingsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'accountSettingsModal';
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
    }

    const isSuper = currentUser?.role === 'super_admin';
    const isDemo = currentTenant?.demo_status?.is_demo;
    const displayName = currentProfile?.first_name ? `${currentProfile.first_name} ${currentProfile.last_name || ''}`.trim() : (currentUser?.email || 'User');
    const roleLabel = isSuper ? 'SUPER ADMIN (FULL PLATFORM ACCESS)' : (isDemo ? '7-DAY DEMO TRIAL USER' : (currentUser?.role || 'MEMBER').toUpperCase());
    const roleBadgeClass = isSuper ? 'badge-super-admin' : (isDemo ? 'badge-gold' : 'badge-emerald');

    // Fetch accessible tenants if Super Admin
    let tenantsHtml = '';
    if (isSuper) {
      try {
        const res = await fetch('/api/auth/tenants-accessible');
        const data = await res.json();
        if (data.success && data.tenants) {
          const options = data.tenants.map(t => `
            <option value="${t.id}" ${t.id === currentTenant?.id ? 'selected' : ''}>
              ${escapeHtml(t.name)} (${t.county || 'Kenya'}) [${t.slug}]
            </option>
          `).join('');
          tenantsHtml = `
            <div class="form-group" style="margin-top: 1rem;">
              <label>🛡️ Super Admin: Switch Active Tenant Workspace</label>
              <div style="display:flex; gap:0.5rem;">
                <select id="drawerTenantSelect" class="form-control" style="background:#0f172a; color:#f8fafc;">
                  ${options}
                </select>
                <button type="button" class="btn btn-warning btn-sm" onclick="window.AuthManager.handleSwitchTenantFromDrawer()" style="font-weight:700;">
                  Switch
                </button>
              </div>
              <small style="color:#94a3b8; font-size:0.7rem;">Super Admins can switch tenant context on the fly with automatic data isolation.</small>
            </div>
          `;
        }
      } catch (_) {}
    }

    modal.innerHTML = `
      <div class="modal-card account-drawer-card">
        <button class="modal-close-btn" onclick="document.getElementById('accountSettingsModal').classList.remove('active')">&times;</button>
        
        <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1.5rem; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:1.25rem;">
          <div class="user-avatar-circle" style="width:54px; height:54px; font-size:1.4rem;">
            ${displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 style="margin:0; font-size:1.2rem; color:#fff;">${escapeHtml(displayName)}</h3>
            <div style="color:#94a3b8; font-size:0.8rem; margin:0.2rem 0;">${escapeHtml(currentUser?.email || '')}</div>
            <span class="badge ${roleBadgeClass}" style="font-size:0.7rem; padding:0.2rem 0.6rem;">${roleLabel}</span>
          </div>
        </div>

        <!-- Tenant Workspace Isolation Card -->
        <div class="tenant-isolation-banner">
          <div class="icon">🛡️</div>
          <div class="text">
            <h5>STRICT TENANT ISOLATION ACTIVE</h5>
            <p>Workspace: <strong>${escapeHtml(currentTenant?.name || 'Default')}</strong></p>
            <div class="workspace-id-badge" style="margin-top: 0.35rem;">
              Tenant UUID: ${escapeHtml(currentTenant?.id || 'a0000000-0000-0000-0000-000000000001')}
            </div>
          </div>
        </div>

        ${tenantsHtml}

        <!-- Tabs inside Account Settings -->
        <div class="account-section-title">
          <span>Security & Password</span>
        </div>
        <form id="drawerPasswordForm" onsubmit="window.AuthManager.handleChangePassword(event)">
          <div class="form-row">
            <div class="form-group">
              <label>Current Password</label>
              <input type="password" id="drawerCurrentPass" class="form-control" placeholder="••••••••" required>
            </div>
            <div class="form-group">
              <label>New Password (Min 6 chars)</label>
              <input type="password" id="drawerNewPass" class="form-control" placeholder="••••••••" minlength="6" required>
            </div>
          </div>
          <div id="drawerPassError" class="auth-error-msg" style="display:none;"></div>
          <div id="drawerPassSuccess" class="toast-success" style="display:none; padding:0.5rem; border-radius:6px; font-size:0.75rem; margin-bottom:0.75rem;"></div>
          <button type="submit" class="btn btn-secondary btn-sm" id="btnDrawerPassSubmit">
            Update Password
          </button>
        </form>

        <div style="margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center;">
          ${isSuper ? `
            <button class="btn btn-warning btn-sm" onclick="document.getElementById('accountSettingsModal').classList.remove('active'); window.switchTab('admin');" style="background: linear-gradient(135deg, #f59e0b, #d97706); color:#fff; font-weight:700;">
              🛡️ Super Admin Portal
            </button>
          ` : `
            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('accountSettingsModal').classList.remove('active'); window.switchTab('credentials');">
              🔑 Custom API Keys
            </button>
          `}
          
          <button class="btn btn-danger btn-sm" onclick="window.AuthManager.logout()" style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5;">
            Sign Out
          </button>
        </div>

      </div>
    `;

    modal.classList.add('active');
  }

  function handleSwitchTenantFromDrawer() {
    const sel = document.getElementById('drawerTenantSelect');
    if (!sel || !sel.value) return;
    const tenantId = sel.value;
    const tenantName = sel.options[sel.selectedIndex].text;
    switchTenant(tenantId, tenantName);
  }

  // ── Form Handlers ───────────────────────────────────────────────────────────
  async function handleLoginForm(e) {
    e.preventDefault();
    const btn = document.getElementById('btnLoginSubmit');
    const errBox = document.getElementById('loginErrorMsg');
    errBox.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Authenticating...';

    try {
      const email = document.getElementById('loginEmail').value;
      const pass = document.getElementById('loginPassword').value;
      await login(email, pass);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In to Workspace';
    }
  }

  async function handleDemoForm(e) {
    e.preventDefault();
    const btn = document.getElementById('btnDemoSubmit');
    const errBox = document.getElementById('demoErrorMsg');
    errBox.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Provisioning 7-Day Demo...';

    try {
      const candidate_name = document.getElementById('demoCandidateName').value;
      const organization_name = document.getElementById('demoOrgName').value;
      const phone_number = document.getElementById('demoPhone').value;
      const email = document.getElementById('demoEmail').value;
      await startDemo({ candidate_name, organization_name, phone_number, email });
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = '🚀 Launch 7-Day Full Access Demo';
    }
  }

  async function handleSignupForm(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSignupSubmit');
    const errBox = document.getElementById('signupErrorMsg');
    errBox.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creating Workspace...';

    try {
      const organization_name = document.getElementById('signupOrgName').value;
      const county = document.getElementById('signupCounty')?.value || 'Narok';
      const first_name = document.getElementById('signupFirstName').value;
      const last_name = document.getElementById('signupLastName').value;
      const phone_number = document.getElementById('signupPhone')?.value || '';
      const email = document.getElementById('signupEmail').value;
      const password = document.getElementById('signupPassword').value;
      await signup({ organization_name, county, first_name, last_name, phone_number, email, password });
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Organization & Workspace';
    }
  }

  // ── Recovery Handlers ───────────────────────────────────────────────────────
  async function handleRecoverRequest(e) {
    e.preventDefault();
    const btn = document.getElementById('btnRecoverRequestSubmit');
    const errBox = document.getElementById('recoverRequestErrorMsg');
    errBox.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Generating Recovery Key...';

    const email = document.getElementById('recoverEmail').value;

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Recovery request failed.');
      }

      // Switch to Step 2
      document.getElementById('recoverStep1').style.display = 'none';
      document.getElementById('recoverStep2').style.display = 'block';
      document.getElementById('recoverEmailBadge').textContent = `Account: ${email} (${data.tenant_name || 'Verified'})`;

      // Display recovery code on screen for instant testing/demo verification
      if (data.recovery_code) {
        const alertBox = document.getElementById('recoverCodeAlertBox');
        const codeDisplay = document.getElementById('recoverCodeDisplay');
        const codeInput = document.getElementById('recoverCode');
        if (alertBox && codeDisplay) {
          codeDisplay.textContent = data.recovery_code;
          alertBox.style.display = 'block';
        }
        if (codeInput) {
          codeInput.value = data.recovery_code;
        }
      }

      if (window.showToast) window.showToast('Verification code generated. Enter below to reset password.', 'success');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = '🔑 Send 6-Digit Recovery Code';
    }
  }

  async function handleRecoverReset(e) {
    e.preventDefault();
    const btn = document.getElementById('btnRecoverResetSubmit');
    const errBox = document.getElementById('recoverResetErrorMsg');
    errBox.style.display = 'none';

    const email = document.getElementById('recoverEmail').value;
    const code = document.getElementById('recoverCode').value;
    const new_password = document.getElementById('recoverNewPassword').value;
    const confirm_pass = document.getElementById('recoverConfirmPassword').value;

    if (new_password !== confirm_pass) {
      errBox.textContent = 'Passwords do not match.';
      errBox.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Resetting Password...';

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, new_password })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Password reset failed.');
      }

      // Auto-login from returned session
      if (data.session?.access_token) {
        localStorage.setItem('TALK_SASA_AUTH_TOKEN', data.session.access_token);
        currentToken = data.session.access_token;
      }
      if (data.tenant?.id) {
        localStorage.setItem('TALK_SASA_ACTIVE_TENANT_ID', data.tenant.id);
      }
      currentUser = data.user;
      currentProfile = data.profile;
      currentTenant = data.tenant;

      renderAuthHeader();
      checkSuperAdminAccess();
      closeAuthModal();

      if (window.showToast) window.showToast('🎉 Password reset successful! You are now logged in.', 'success');
      if (window.reloadDashboard) window.reloadDashboard();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Set New Password & Sign In';
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    const btn = document.getElementById('btnDrawerPassSubmit');
    const errBox = document.getElementById('drawerPassError');
    const okBox = document.getElementById('drawerPassSuccess');
    errBox.style.display = 'none';
    okBox.style.display = 'none';

    const current_password = document.getElementById('drawerCurrentPass').value;
    const new_password = document.getElementById('drawerNewPass').value;

    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({ current_password, new_password })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to update password.');

      okBox.textContent = '✅ Password changed successfully.';
      okBox.style.display = 'block';
      document.getElementById('drawerCurrentPass').value = '';
      document.getElementById('drawerNewPass').value = '';
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update Password';
    }
  }

  function openUpgradeModal() {
    alert("Talk Sasa — Plan Upgrade\n\nTo activate a full production plan with dedicated CAK Sender IDs, customized shortcodes, and unlimited ward broadcasts, contact the system administrator or switch to a Standard/Enterprise plan in the Super Admin Console.");
  }

  // ── Global Interface ────────────────────────────────────────────────────────
  window.AuthManager = {
    init: initSession,
    getUser: () => currentUser,
    getTenant: () => currentTenant,
    getProfile: () => currentProfile,
    isSuperAdmin: () => currentUser?.role === 'super_admin',
    isDemo: () => Boolean(currentTenant?.demo_status?.is_demo),
    isExpired: () => Boolean(currentTenant?.demo_status?.is_expired),
    openLoginModal,
    closeModal: closeAuthModal,
    switchTab: switchAuthTab,
    login,
    signup,
    startDemo,
    logout,
    switchTenant,
    openUpgradeModal,
    openAccountDrawer,
    fillAdminCredentials,
    handleSwitchTenantFromDrawer,
    handleLoginForm,
    handleDemoForm,
    handleSignupForm,
    handleRecoverRequest,
    handleRecoverReset,
    handleChangePassword
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSession);
  } else {
    initSession();
  }
})();
