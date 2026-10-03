/**
 * Narok Talk Sasa – API Credentials Manager
 * Loads all gateway configs from /api/credentials and renders
 * a premium settings panel for entering / verifying API keys.
 */
(function () {
  'use strict';

  /* ── Category meta ───────────────────────────────────────── */
  const CATEGORY_META = {
    sms:      { label: 'SMS Gateway',        color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
    voice:    { label: 'Voice / IVR',        color: '#6366f1', bg: 'rgba(99,102,241,0.12)'  },
    whatsapp: { label: 'WhatsApp',           color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
    social:   { label: 'Social Ads',         color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
    email:    { label: 'Email',              color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
    database: { label: 'Database',           color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
    ussd:     { label: 'USSD',              color: '#ec4899', bg: 'rgba(236,72,153,0.12)'  }
  };

  /* ── Field label prettifier ──────────────────────────────── */
  const FIELD_LABELS = {
    api_key: 'API Key', api_secret: 'API Secret', username: 'Username',
    phone_number_id: 'Phone Number ID', access_token: 'Access Token',
    business_account_id: 'Business Account ID', app_id: 'App ID',
    app_secret: 'App Secret', verify_token: 'Verify Token',
    ad_account_id: 'Ad Account ID', pixel_id: 'Pixel ID',
    access_token_secret: 'Access Token Secret', sender_id: 'Sender ID',
    shortcode: 'Shortcode', caller_id: 'Caller ID', service_code: 'USSD Service Code',
    url: 'Supabase URL', anon_key: 'Anon Key', service_role_key: 'Service Role Key',
    from_email: 'From Email', from_name: 'From Name'
  };

  /* ── State ───────────────────────────────────────────────── */
  let allCredentials = [];

  /* ── Helpers ─────────────────────────────────────────────── */
  function label(k) { return FIELD_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
  function isSensitive(k) { return /key|secret|token|password|role/i.test(k); }

  function statusBadge(cred) {
    const v = cred.verification_status || 'unverified';
    const cfg = {
      connected:  { text: '● Connected',  color: '#10b981' },
      unverified: { text: '○ Unverified', color: '#9ca3af' },
      failed:     { text: '✕ Failed',     color: '#ef4444' }
    }[v] || { text: v, color: '#9ca3af' };
    return `<span style="color:${cfg.color};font-size:0.75rem;font-weight:600;">${cfg.text}</span>`;
  }

  /* ── Render credentials cards ────────────────────────────── */
  function renderCredentials(creds) {
    const container = document.getElementById('credentialsGrid');
    if (!container) return;

    // Group by category
    const groups = {};
    for (const c of creds) {
      const cat = c.category || 'other';
      (groups[cat] = groups[cat] || []).push(c);
    }

    container.innerHTML = '';

    for (const [cat, items] of Object.entries(groups)) {
      const meta = CATEGORY_META[cat] || { label: cat, color: '#6b7280', bg: 'rgba(107,114,128,0.1)' };

      const section = document.createElement('div');
      section.className = 'cred-section';
      section.innerHTML = `
        <div class="cred-section-header">
          <span class="cred-section-label" style="color:${meta.color};">${meta.label}</span>
        </div>
        <div class="cred-cards-row" id="cred-group-${cat}"></div>
      `;
      container.appendChild(section);

      const row = section.querySelector(`#cred-group-${cat}`);
      for (const cred of items) {
        row.appendChild(renderCard(cred, meta));
      }
    }
  }

  function renderCard(cred, meta) {
    const card = document.createElement('div');
    card.className = 'cred-card' + (cred.is_configured ? ' configured' : '');
    card.dataset.service = cred.service_name;
    card.innerHTML = `
      <div class="cred-card-header">
        <span class="cred-icon">${cred.icon || '🔑'}</span>
        <div class="cred-card-title">
          <strong>${cred.display_name}</strong>
          ${statusBadge(cred)}
        </div>
        <div class="cred-card-actions">
          <button class="btn-cred-edit" onclick="window.CredManager.openEdit('${cred.service_name}')" title="Edit credentials">✏️</button>
          ${cred.is_configured ? `<button class="btn-cred-verify" onclick="window.CredManager.verify('${cred.service_name}')" title="Verify connection">🔍</button>` : ''}
        </div>
      </div>
      <div class="cred-card-body">
        <div class="cred-fields-preview">
          ${Object.entries(cred.credentials || {}).map(([k, v]) => `
            <div class="cred-field-row">
              <span class="cred-field-label">${label(k)}</span>
              <span class="cred-field-val ${v ? 'has-val' : 'empty-val'}">${v || '—'}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="cred-card-footer" style="border-top: 1px solid rgba(255,255,255,0.06); padding: 8px 14px;">
        <span style="font-size:0.7rem;color:#6b7280;">
          ${cred.last_verified_at ? '✓ Verified ' + new Date(cred.last_verified_at).toLocaleDateString() : 'Not yet verified'}
        </span>
        <label class="cred-toggle" title="Enable/Disable service">
          <input type="checkbox" ${cred.is_active ? 'checked' : ''} onchange="window.CredManager.toggleActive('${cred.service_name}', this.checked)">
          <span class="cred-toggle-slider"></span>
        </label>
      </div>
    `;
    return card;
  }

  /* ── Edit Modal ───────────────────────────────────────────── */
  function openEdit(serviceName) {
    const cred = allCredentials.find(c => c.service_name === serviceName);
    if (!cred) return;

    const modal = document.getElementById('modalCredEdit');
    if (!modal) return;

    document.getElementById('credEditTitle').textContent = cred.display_name;
    document.getElementById('credEditServiceName').value = serviceName;

    const fieldsContainer = document.getElementById('credEditFields');
    fieldsContainer.innerHTML = '';

    for (const [k, v] of Object.entries(cred.credentials || {})) {
      const sensitive = isSensitive(k);
      const row = document.createElement('div');
      row.className = 'cred-edit-field';
      row.innerHTML = `
        <label class="cred-edit-label">${label(k)}</label>
        <div class="cred-edit-input-wrap">
          <input
            type="${sensitive ? 'password' : 'text'}"
            id="cred_field_${k}"
            data-key="${k}"
            class="cred-edit-input"
            placeholder="Enter ${label(k)}…"
            value="${sensitive ? '' : (v || '')}"
            autocomplete="off"
          />
          ${sensitive ? `<button type="button" class="btn-toggle-reveal" onclick="window.CredManager.toggleReveal('cred_field_${k}')">👁</button>` : ''}
        </div>
        ${sensitive && v ? '<span class="cred-saved-hint">✓ Saved (hidden)</span>' : ''}
      `;
      fieldsContainer.appendChild(row);
    }

    // Notes field
    const notesRow = document.createElement('div');
    notesRow.className = 'cred-edit-field';
    notesRow.innerHTML = `
      <label class="cred-edit-label">Notes (optional)</label>
      <textarea id="cred_field_notes" class="cred-edit-input" rows="2" placeholder="e.g. Africa's Talking sandbox mode">${cred.notes || ''}</textarea>
    `;
    fieldsContainer.appendChild(notesRow);

    if (typeof window.openModal === 'function') window.openModal('modalCredEdit');
    else modal.classList.add('active');
  }

  /* ── Save credentials ─────────────────────────────────────── */
  async function saveCredentials() {
    const serviceName = document.getElementById('credEditServiceName').value;
    const inputs = document.querySelectorAll('#credEditFields [data-key]');
    const credentials = {};
    inputs.forEach(inp => {
      if (inp.value.trim()) credentials[inp.dataset.key] = inp.value.trim();
    });
    const notes = document.getElementById('cred_field_notes')?.value?.trim();

    const saveBtn = document.getElementById('btnSaveCredentials');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    try {
      const res = await fetch(window.getApiUrl(`/api/credentials/${serviceName}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials, notes })
      });
      const data = await res.json();

      if (data.success) {
        if (typeof window.showToast === 'function') window.showToast(`✅ ${data.message}`, 'success');
        if (typeof window.closeModal === 'function') window.closeModal('modalCredEdit');
        else document.getElementById('modalCredEdit')?.classList.remove('active');
        loadCredentials();
      } else {
        if (typeof window.showToast === 'function') window.showToast(`❌ ${data.error}`, 'error');
      }
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast(`❌ Save failed: ${e.message}`, 'error');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Credentials'; }
    }
  }

  /* ── Verify connection ───────────────────────────────────── */
  async function verify(serviceName) {
    try {
      const res = await fetch(window.getApiUrl(`/api/credentials/${serviceName}/verify`), { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (typeof window.showToast === 'function') window.showToast(`🔍 ${serviceName} marked as connected!`, 'success');
        loadCredentials();
      }
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast(`❌ Verify failed: ${e.message}`, 'error');
    }
  }

  /* ── Toggle active ───────────────────────────────────────── */
  async function toggleActive(serviceName, isActive) {
    try {
      const cred = allCredentials.find(c => c.service_name === serviceName);
      await fetch(window.getApiUrl(`/api/credentials/${serviceName}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: cred?.credentials || {}, is_active: isActive })
      });
      if (typeof window.showToast === 'function') {
        window.showToast(`${isActive ? '✅ Enabled' : '⏸️ Disabled'}: ${serviceName}`, 'info');
      }
      loadCredentials();
    } catch (e) { console.error('Toggle failed', e); }
  }

  /* ── Toggle password reveal ──────────────────────────────── */
  function toggleReveal(id) {
    const inp = document.getElementById(id);
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  /* ── Load credentials from API ───────────────────────────── */
  async function loadCredentials() {
    const container = document.getElementById('credentialsGrid');
    if (!container) return;

    try {
      const res  = await fetch(window.getApiUrl('/api/credentials'));
      const data = await res.json();
      if (data.success) {
        allCredentials = data.data || [];
        renderCredentials(allCredentials);
      }
    } catch (e) {
      console.error('Failed to load credentials:', e);
      if (container) container.innerHTML = `<p style="color:#ef4444;padding:1rem;">⚠️ Could not load credentials: ${e.message}</p>`;
    }
  }

  /* ── Public API ───────────────────────────────────────────── */
  window.CredManager = { openEdit, saveCredentials, verify, toggleActive, toggleReveal, loadCredentials };

  /* ── Auto-init ────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    // Wire save button
    const saveBtn = document.getElementById('btnSaveCredentials');
    if (saveBtn) saveBtn.addEventListener('click', saveCredentials);

    // Load when credentials tab/section is visible
    const credSection = document.getElementById('credentialsSection');
    if (credSection) {
      loadCredentials();
    }

    // Also trigger on tab clicks (if using tab navigation)
    document.querySelectorAll('[data-tab="credentials"], [data-section="credentials"]').forEach(el => {
      el.addEventListener('click', loadCredentials);
    });
  });

})();
