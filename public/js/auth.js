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
    const tabs = ['login', 'signup', 'demo'];
    tabs.forEach(t => {
      const btn = document.getElementById(`tabBtn_${t}`);
      const pane = document.getElementById(`tabPane_${t}`);
      if (btn) btn.classList.toggle('active', t === tab);
      if (pane) pane.classList.toggle('active', t === tab);
    });
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
          <p>Narok County Political Outreach & Omnichannel Platform</p>
        </div>

        <div class="auth-tabs-nav">
          <button id="tabBtn_login" class="auth-tab-btn active" onclick="window.AuthManager.switchTab('login')">Sign In</button>
          <button id="tabBtn_demo" class="auth-tab-btn" onclick="window.AuthManager.switchTab('demo')" style="color: #ffad00;">⚡ 7-Day Demo</button>
          <button id="tabBtn_signup" class="auth-tab-btn" onclick="window.AuthManager.switchTab('signup')">Register Org</button>
        </div>

        <!-- 1. SIGN IN TAB -->
        <div id="tabPane_login" class="auth-tab-pane active">
          <form id="loginForm" onsubmit="window.AuthManager.handleLoginForm(event)">
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="loginEmail" class="form-control" placeholder="admin@naroktalksasa.ke" required>
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="loginPassword" class="form-control" placeholder="••••••••" required>
            </div>
            <div id="loginErrorMsg" class="auth-error-msg" style="display:none;"></div>
            <button type="submit" class="btn btn-primary btn-block" id="btnLoginSubmit">
              Sign In to Workspace
            </button>
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
            <button type="submit" class="btn btn-gold btn-block" id="btnDemoSubmit" style="font-weight: 800;">
              🚀 Launch 7-Day Full Access Demo
            </button>
          </form>
        </div>

        <!-- 3. SIGNUP TAB -->
        <div id="tabPane_signup" class="auth-tab-pane">
          <form id="signupForm" onsubmit="window.AuthManager.handleSignupForm(event)">
            <div class="form-row">
              <div class="form-group">
                <label>First Name</label>
                <input type="text" id="signupFirstName" class="form-control" placeholder="Ole" required>
              </div>
              <div class="form-group">
                <label>Last Name</label>
                <input type="text" id="signupLastName" class="form-control" placeholder="Ntutu" required>
              </div>
            </div>
            <div class="form-group">
              <label>Organization / Coalition Name</label>
              <input type="text" id="signupOrgName" class="form-control" placeholder="Narok United Coalition" required>
            </div>
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="signupEmail" class="form-control" placeholder="director@coalition.ke" required>
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="signupPassword" class="form-control" placeholder="Min 6 characters" minlength="6" required>
            </div>
            <div id="signupErrorMsg" class="auth-error-msg" style="display:none;"></div>
            <button type="submit" class="btn btn-primary btn-block" id="btnSignupSubmit">
              Create Organization & Workspace
            </button>
          </form>
        </div>

      </div>
    `;
    return el;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
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
      const first_name = document.getElementById('signupFirstName').value;
      const last_name = document.getElementById('signupLastName').value;
      const organization_name = document.getElementById('signupOrgName').value;
      const email = document.getElementById('signupEmail').value;
      const password = document.getElementById('signupPassword').value;
      await signup({ first_name, last_name, organization_name, email, password });
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Organization & Workspace';
    }
  }

  function openUpgradeModal() {
    alert("Talk Sasa — Plan Upgrade\n\nTo activate a full production plan with dedicated CAK Sender IDs, customized shortcodes, and unlimited ward broadcasts, contact the system administrator or switch to a Standard/Enterprise plan in the Super Admin Console.");
  }

  function openAccountDrawer() {
    window.switchTab('credentials');
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
    handleLoginForm,
    handleDemoForm,
    handleSignupForm
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSession);
  } else {
    initSession();
  }
})();
