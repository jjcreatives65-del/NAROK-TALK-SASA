/**
 * Talk Sasa — Super Admin Portal Controller
 * Overall system management:
 * 1. Platform Master API Keys console (powering Demo accounts)
 * 2. Multi-tenant lifecycle control (Create, Activate, Suspend, Extend Demo, Switch)
 * 3. System-wide KPIs & Telemetry
 */
(function() {
  'use strict';

  let adminTenants = [];
  let platformCreds = [];
  let currentFilter = 'all';

  // ── 1. Init & Data Fetching ─────────────────────────────────────────────────
  async function initAdminPortal() {
    if (!window.AuthManager?.isSuperAdmin()) {
      return;
    }
    await loadOverview();
    await loadTenants();
    await loadPlatformCredentials();
  }

  async function loadOverview() {
    try {
      const res = await fetch('/api/admin/overview');
      const data = await res.json();
      if (!data.success) return;

      const stats = data.stats;
      const el = (id, val) => {
        const target = document.getElementById(id);
        if (target) target.textContent = val;
      };

      el('admStatTotalTenants', stats.totalTenants);
      el('admStatActiveTenants', stats.activeTenants);
      el('admStatDemoTenants', stats.demoTenants);
      el('admStatExpiredDemos', stats.expiredDemos);
      el('admStatTotalContacts', Number(stats.totalContacts).toLocaleString());
      el('admStatPlatformGateways', `${stats.platformGatewaysConfigured}/${stats.totalGatewaysAvailable} Live`);
    } catch (err) {
      console.warn('[Admin] Failed to load overview metrics:', err);
    }
  }

  async function loadTenants() {
    try {
      const res = await fetch('/api/admin/tenants');
      const data = await res.json();
      if (!data.success) return;

      adminTenants = data.tenants || [];
      renderTenantsTable();
    } catch (err) {
      console.warn('[Admin] Failed to load tenants:', err);
    }
  }

  async function loadPlatformCredentials() {
    try {
      const res = await fetch('/api/admin/platform-credentials');
      const data = await res.json();
      if (!data.success) return;

      platformCreds = data.data || [];
      renderPlatformCredsCards();
    } catch (err) {
      console.warn('[Admin] Failed to load platform credentials:', err);
    }
  }

  // ── 2. Render Tenants Table ─────────────────────────────────────────────────
  function renderTenantsTable() {
    const tbody = document.getElementById('adminTenantsTbody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('adminTenantSearch')?.value || '').toLowerCase().trim();

    let filtered = adminTenants.filter(t => {
      // Filter tab
      if (currentFilter === 'active' && (!t.is_active || t.demo_status?.is_expired)) return false;
      if (currentFilter === 'demo' && !t.demo_status?.is_demo) return false;
      if (currentFilter === 'expired' && (!t.demo_status?.is_demo || !t.demo_status?.is_expired)) return false;

      // Search term
      if (searchTerm) {
        const matchesName = (t.name || '').toLowerCase().includes(searchTerm);
        const matchesSlug = (t.slug || '').toLowerCase().includes(searchTerm);
        const matchesCounty = (t.county || '').toLowerCase().includes(searchTerm);
        if (!matchesName && !matchesSlug && !matchesCounty) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding: 2.5rem; color: #9ca3af;">
            No organizations match the selected filter.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(t => {
      const isDemo = t.demo_status?.is_demo;
      const isExpired = t.demo_status?.is_expired;
      
      let planBadge = `<span class="badge badge-emerald">Standard</span>`;
      if (isDemo) {
        planBadge = `<span class="badge badge-gold" style="font-weight:800;">⚡ 7-Day Demo</span>`;
      } else if (t.settings?.plan === 'enterprise') {
        planBadge = `<span class="badge badge-super-admin">Enterprise</span>`;
      }

      let statusBadge = t.is_active 
        ? `<span class="status-pill active">● Active</span>`
        : `<span class="status-pill suspended">○ Suspended</span>`;

      if (isDemo && isExpired) {
        statusBadge = `<span class="status-pill expired">⚠️ Demo Expired</span>`;
      }

      let expiryHtml = `<span style="color:#6b7280;">Perpetual</span>`;
      if (isDemo) {
        if (isExpired) {
          expiryHtml = `<span style="color:#ef4444; font-weight:700;">Expired</span>`;
        } else {
          const d = t.demo_status.days_remaining ?? 0;
          const h = t.demo_status.hours_remaining ?? 0;
          expiryHtml = `<span style="color:#f59e0b; font-weight:700;">${d}d ${h}h remaining</span>`;
        }
      }

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.65rem;">
              <div class="org-avatar-badge">${(t.name || 'O').charAt(0).toUpperCase()}</div>
              <div>
                <strong>${escapeHtml(t.name)}</strong>
                <div style="font-size:0.75rem; color:#6b7280;">/${escapeHtml(t.slug)} • ${escapeHtml(t.county || 'Narok')}</div>
              </div>
            </div>
          </td>
          <td>${planBadge}</td>
          <td>${statusBadge}</td>
          <td>${expiryHtml}</td>
          <td><strong>${Number(t.contact_count || 0).toLocaleString()}</strong> contacts</td>
          <td>
            <span class="badge badge-gray" style="font-family:monospace; font-size:0.75rem;">${escapeHtml(t.sender_id || 'TALKSASA')}</span>
          </td>
          <td>
            <div class="action-btn-group">
              ${isDemo ? `
                <button class="btn btn-xs btn-outline" onclick="window.AdminManager.extendDemo('${t.id}')" title="Extend 7 Days">
                  ⏱️ +7d
                </button>
                <button class="btn btn-xs btn-outline" onclick="window.AdminManager.activatePlan('${t.id}')" title="Convert to Paid/Active Plan">
                  ✅ Activate
                </button>
              ` : ''}
              
              <button class="btn btn-xs btn-outline" onclick="window.AdminManager.toggleSuspend('${t.id}', ${!t.is_active})" title="${t.is_active ? 'Suspend Workspace' : 'Resume Workspace'}">
                ${t.is_active ? '⏸️' : '▶️'}
              </button>

              <button class="btn btn-xs btn-primary" onclick="window.AuthManager.switchTenant('${t.id}', '${escapeHtml(t.name)}')" title="Switch Into This Workspace">
                👁️ Switch
              </button>

              ${t.id !== 'a0000000-0000-0000-0000-000000000001' ? `
                <button class="btn btn-xs btn-danger-outline" onclick="window.AdminManager.deleteTenant('${t.id}', '${escapeHtml(t.name)}')" title="Delete Tenant">
                  🗑️
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ── 3. Render Platform Master Credentials ────────────────────────────────────
  function renderPlatformCredsCards() {
    const container = document.getElementById('adminPlatformCredsGrid');
    if (!container) return;

    container.innerHTML = platformCreds.map(c => {
      const isConfigured = c.is_configured;
      const statusColor = isConfigured ? '#10b981' : '#f59e0b';
      const statusText = isConfigured ? '● Active & Powering Demos' : '○ Unconfigured (Uses .env fallback)';

      return `
        <div class="platform-cred-card">
          <div class="cred-card-header">
            <span class="cred-icon">${c.icon || '🔑'}</span>
            <div style="flex:1;">
              <strong>${c.display_name}</strong>
              <div style="font-size:0.75rem; color:${statusColor}; font-weight:600;">${statusText}</div>
            </div>
            <button class="btn btn-xs btn-outline" onclick="window.AdminManager.openEditPlatformCred('${c.service_name}')">
              ✏️ Edit
            </button>
            <button class="btn btn-xs btn-secondary" onclick="window.AdminManager.verifyPlatformCred('${c.service_name}')">
              🔍 Test
            </button>
          </div>
          <div class="cred-fields-preview">
            ${Object.entries(c.credentials || {}).map(([k, v]) => `
              <div class="cred-field-row">
                <span class="field-key">${formatFieldKey(k)}:</span>
                <span class="field-val">${v ? escapeHtml(String(v)) : '<em style="color:#6b7280;">(empty)</em>'}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function formatFieldKey(k) {
    return k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }

  // ── Tenant Lifecycle Operations ─────────────────────────────────────────────
  async function extendDemo(tenantId) {
    if (!confirm('Extend this organization\'s 7-Day Demo trial by an additional 7 days?')) return;
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extend_demo_days: 7 })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (window.showToast) window.showToast('Demo trial extended by +7 days!', 'success');
      await loadTenants();
      await loadOverview();
    } catch (err) {
      alert(`Error extending demo: ${err.message}`);
    }
  }

  async function activatePlan(tenantId) {
    const plan = prompt('Enter plan to activate ("standard" or "enterprise"):', 'standard');
    if (!plan) return;

    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activate_plan: plan })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (window.showToast) window.showToast(`Tenant successfully activated to ${plan} plan!`, 'success');
      await loadTenants();
      await loadOverview();
    } catch (err) {
      alert(`Error activating plan: ${err.message}`);
    }
  }

  async function toggleSuspend(tenantId, setActive) {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: setActive })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (window.showToast) window.showToast(`Tenant status updated to: ${setActive ? 'Active' : 'Suspended'}`, 'info');
      await loadTenants();
      await loadOverview();
    } catch (err) {
      alert(`Error updating tenant: ${err.message}`);
    }
  }

  async function deleteTenant(tenantId, name) {
    if (!confirm(`Are you sure you want to permanently delete organization "${name}"? This action cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (window.showToast) window.showToast(`Organization "${name}" deleted.`, 'success');
      await loadTenants();
      await loadOverview();
    } catch (err) {
      alert(`Error deleting tenant: ${err.message}`);
    }
  }

  function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.admin-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderTenantsTable();
  }

  // ── Create Tenant Modal ─────────────────────────────────────────────────────
  function openCreateTenantModal() {
    let modal = document.getElementById('adminCreateTenantModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'adminCreateTenantModal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-card">
          <button class="modal-close-btn" onclick="document.getElementById('adminCreateTenantModal').classList.remove('active')">&times;</button>
          <div class="modal-header">
            <h3>Provision New Organization</h3>
            <p>Create a political campaign or organization workspace</p>
          </div>
          <form id="adminCreateTenantForm" onsubmit="window.AdminManager.handleCreateTenantSubmit(event)">
            <div class="form-group">
              <label>Organization / Campaign Name</label>
              <input type="text" id="admNewOrgName" class="form-control" placeholder="Narok South Youth Movement" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>URL Slug</label>
                <input type="text" id="admNewSlug" class="form-control" placeholder="narok-south-youth" required>
              </div>
              <div class="form-group">
                <label>Default Sender ID</label>
                <input type="text" id="admNewSenderId" class="form-control" placeholder="TALKSASA" maxlength="11">
              </div>
            </div>
            <div class="form-group">
              <label>Workspace Type & Plan</label>
              <select id="admNewPlanType" class="form-control">
                <option value="demo">⚡ 7-Day Demo Trial (Pre-configured Platform API Keys)</option>
                <option value="standard" selected>Standard Political Campaign (Full Isolated CRM)</option>
                <option value="enterprise">Enterprise Coalition (Multi-ward & High Volume)</option>
              </select>
            </div>
            <div id="admCreateTenantError" class="auth-error-msg" style="display:none;"></div>
            <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1.5rem;">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('adminCreateTenantModal').classList.remove('active')">Cancel</button>
              <button type="submit" class="btn btn-primary" id="btnAdmSubmitTenant">Create Organization</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(modal);

      // Auto slug generator
      document.getElementById('admNewOrgName')?.addEventListener('input', (e) => {
        const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40);
        const slugInput = document.getElementById('admNewSlug');
        if (slugInput && !slugInput.dataset.manual) slugInput.value = slug;
      });
      document.getElementById('admNewSlug')?.addEventListener('input', (e) => {
        e.target.dataset.manual = 'true';
      });
    }

    modal.classList.add('active');
  }

  async function handleCreateTenantSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btnAdmSubmitTenant');
    const errBox = document.getElementById('admCreateTenantError');
    errBox.style.display = 'none';
    btn.disabled = true;

    try {
      const name = document.getElementById('admNewOrgName').value;
      const slug = document.getElementById('admNewSlug').value;
      const sender_id = document.getElementById('admNewSenderId').value || 'TALKSASA';
      const planType = document.getElementById('admNewPlanType').value;
      const is_demo = planType === 'demo';

      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, sender_id, plan: planType, is_demo })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      document.getElementById('adminCreateTenantModal').classList.remove('active');
      if (window.showToast) window.showToast(`Organization "${name}" created successfully!`, 'success');
      await loadTenants();
      await loadOverview();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  }

  // ── Platform Master Credentials Operations ──────────────────────────────────
  async function openEditPlatformCred(serviceName) {
    const cred = platformCreds.find(c => c.service_name === serviceName);
    if (!cred) return;

    let modal = document.getElementById('adminPlatformCredEditModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'adminPlatformCredEditModal';
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-card">
        <button class="modal-close-btn" onclick="document.getElementById('adminPlatformCredEditModal').classList.remove('active')">&times;</button>
        <div class="modal-header">
          <h3>Configure Platform Master: ${cred.display_name}</h3>
          <p style="color:#ffad00; font-size:0.85rem;">⚡ This master key powers all 7-Day Demo accounts and platform fallbacks</p>
        </div>
        <form id="adminEditCredForm" onsubmit="window.AdminManager.handleSavePlatformCred(event, '${serviceName}')">
          <div class="form-fields-wrapper">
            ${Object.keys(cred.credentials || {}).map(fieldKey => `
              <div class="form-group">
                <label>${formatFieldKey(fieldKey)}</label>
                <input type="${/key|secret|token|password/i.test(fieldKey) ? 'password' : 'text'}" 
                       id="admCred_${fieldKey}" 
                       class="form-control" 
                       placeholder="Enter new ${formatFieldKey(fieldKey)} (leave blank to keep unchanged)">
              </div>
            `).join('')}
          </div>
          <div id="admCredSaveError" class="auth-error-msg" style="display:none;"></div>
          <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1.5rem;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('adminPlatformCredEditModal').classList.remove('active')">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btnAdmSaveCred">Save Platform Master Key</button>
          </div>
        </form>
      </div>
    `;

    modal.classList.add('active');
  }

  async function handleSavePlatformCred(e, serviceName) {
    e.preventDefault();
    const cred = platformCreds.find(c => c.service_name === serviceName);
    if (!cred) return;

    const btn = document.getElementById('btnAdmSaveCred');
    const errBox = document.getElementById('admCredSaveError');
    errBox.style.display = 'none';
    btn.disabled = true;

    const fields = {};
    for (const key of Object.keys(cred.credentials || {})) {
      const val = document.getElementById(`admCred_${key}`)?.value;
      if (val && val.trim()) {
        fields[key] = val.trim();
      }
    }

    try {
      const res = await fetch(`/api/admin/platform-credentials/${serviceName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: fields, is_active: true })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      document.getElementById('adminPlatformCredEditModal').classList.remove('active');
      if (window.showToast) window.showToast(`Platform master key for "${cred.display_name}" updated!`, 'success');
      await loadPlatformCredentials();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  }

  async function verifyPlatformCred(serviceName) {
    try {
      if (window.showToast) window.showToast(`Testing live gateway for ${serviceName}...`, 'info');
      const res = await fetch(`/api/admin/platform-credentials/${serviceName}/verify`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (window.showToast) window.showToast(`✅ Gateway test passed: ${data.message}`, 'success');
      await loadPlatformCredentials();
    } catch (err) {
      alert(`Gateway test error: ${err.message}`);
    }
  }

  // ── Global Interface ────────────────────────────────────────────────────────
  window.AdminManager = {
    init: initAdminPortal,
    loadOverview,
    loadTenants,
    loadPlatformCredentials,
    setFilter,
    extendDemo,
    activatePlan,
    toggleSuspend,
    deleteTenant,
    openCreateTenantModal,
    handleCreateTenantSubmit,
    openEditPlatformCred,
    handleSavePlatformCred,
    verifyPlatformCred
  };

  // Switch tab hook
  const originalSwitchTab = window.switchTab;
  window.switchTab = function(targetId) {
    if (typeof originalSwitchTab === 'function') originalSwitchTab(targetId);
    if (targetId === 'admin') {
      initAdminPortal();
    }
  };
})();
