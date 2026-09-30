// ========================================================
// TALK SASA MAIN APP COORDINATOR
// ========================================================

const state = {
  activeTab: 'overview',
  stats: null,
  wards: [],
  selectedWard: 'all',
  selectedChannel: 'sms',
  selectedSenderId: 'NAROK_TALK',
  allConstituents: [],
  senderIds: [],
  rallies: []
};

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'success' ? 'toast-success' : (type === 'error' ? 'toast-error' : '')}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : (type === 'error' ? '⚠️' : 'ℹ️')}</span>
    <div>${message}</div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Modal management
function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add('active');
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.remove('active');
}

// Tab Switching
function switchTab(targetTab) {
  state.activeTab = targetTab;

  // Update nav buttons
  const buttons = document.querySelectorAll('.nav-tab-btn');
  buttons.forEach(btn => {
    if (btn.dataset.target === targetTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update view sections
  const sections = document.querySelectorAll('.view-section');
  sections.forEach(sec => {
    if (sec.id === `view-${targetTab}`) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });

  // Trigger tab-specific refresh
  if (targetTab === 'crm') {
    if (window.loadCrmData) window.loadCrmData();
  } else if (targetTab === 'campaigns') {
    if (window.initCampaignStudio) window.initCampaignStudio();
    else if (window.updateCampaignPreview) window.updateCampaignPreview();

  } else if (targetTab === 'senders') {
    if (window.loadSenderIds) window.loadSenderIds();
  } else if (targetTab === 'rallies') {
    if (window.loadRallies) window.loadRallies();
  } else if (targetTab === 'schema') {
    if (window.loadSchemaDdl) window.loadSchemaDdl();
  } else if (targetTab === 'excel') {
    if (window.initExcelUpload) window.initExcelUpload();
  }
}

// Fetch Overview Stats
async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const json = await res.json();
    if (json.success) {
      state.stats = json.data;
      updateOverviewUI(json.data);
      populateWardDropdowns(json.data.allWards);
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function updateOverviewUI(stats) {
  const elConstituents = document.getElementById('statConstituents');
  if (elConstituents) {
    elConstituents.textContent = (stats.totalConstituents || 0).toLocaleString();
  }

  const elSenders = document.getElementById('statSenders');
  if (elSenders) {
    elSenders.textContent = `${stats.totalSenderIds || 4} Approved`;
  }

  // Render ward breakdown list
  const wardList = document.getElementById('overviewWardList');
  if (wardList && stats.wardCounts) {
    const sortedWards = Object.entries(stats.wardCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    wardList.innerHTML = sortedWards.map(([ward, count]) => `
      <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-input); padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.78rem;">
        <span style="font-weight: 600; color: #fff;">${ward}</span>
        <span style="font-family: var(--font-mono); color: var(--accent-blue);">${count} voters indexed</span>
      </div>
    `).join('');
  }

  // Load campaigns for overview
  loadOverviewCampaigns();
}

async function loadOverviewCampaigns() {
  try {
    const res = await fetch('/api/campaigns');
    const json = await res.json();
    if (json.success) {
      const container = document.getElementById('overviewCampaignsList');
      if (!container) return;

      const items = json.data.slice(0, 3);
      if (items.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">No campaigns recorded yet.</div>`;
        return;
      }

      container.innerHTML = items.map(c => `
        <div style="border-bottom: 1px solid var(--border-subtle); padding: 0.85rem 0; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="font-weight: 700; color: #fff; font-size: 0.88rem; margin-bottom: 0.2rem;">${c.campaign_name}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); display: flex; gap: 0.6rem; align-items: center;">
              <span class="badge ${c.status === 'completed' ? 'badge-green' : 'badge-amber'}">${c.status}</span>
              <span>Sender ID: <strong>${c.sender_id}</strong></span>
              <span>Target: <strong>${c.target_ward || 'All Narok Wards'}</strong></span>
            </div>
          </div>
          <div style="text-align: right; font-family: var(--font-mono); font-size: 0.8rem;">
            <div style="color: var(--accent-green); font-weight: 700;">${(c.successful_deliveries || 0).toLocaleString()} Sent</div>
            <div style="color: var(--text-muted); font-size: 0.72rem;">KES ${(c.estimated_cost_kes || 0).toFixed(2)}</div>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading overview campaigns:', err);
  }
}

function populateWardDropdowns(wards) {
  state.wards = wards || [];
  const dropdownIds = ['crmWardFilter', 'campaignWardSelect', 'constWard', 'rallyWardSelect'];

  dropdownIds.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;

    const currentVal = select.value;
    const isFilter = id === 'crmWardFilter' || id === 'campaignWardSelect';

    let optionsHtml = isFilter ? '<option value="all">All Wards (Narok County)</option>' : '';
    wards.forEach(w => {
      optionsHtml += `<option value="${w}">${w}</option>`;
    });

    select.innerHTML = optionsHtml;
    if (currentVal && wards.includes(currentVal)) {
      select.value = currentVal;
    }
  });
}

// Real-Time Telemetry Polling
async function updateLiveTelemetry() {
  try {
    const res = await fetch('/api/telemetry');
    const json = await res.json();
    if (json.success && json.data) {
      const g = json.data.gateway;
      const elLat = document.getElementById('gatewayLatency');
      const elThroughput = document.getElementById('gatewayThroughput');

      if (elLat) elLat.textContent = `${g.latencyMs}ms`;
      if (elThroughput) elThroughput.textContent = `${(g.throughputReqSec / 1000).toFixed(1)}k req/s`;

      if (window.renderTelemetryDetail) {
        window.renderTelemetryDetail(json.data);
      }
    }
  } catch (err) {
    // Silent fail on polling jitter
  }
}

// Initialization on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  // Setup Tab Listeners
  const navTabs = document.getElementById('navTabs');
  if (navTabs) {
    navTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-tab-btn');
      if (btn && btn.dataset.target) {
        switchTab(btn.dataset.target);
      }
    });
  }

  // Header Buttons
  const btnQuickDispatch = document.getElementById('btnQuickDispatch');
  if (btnQuickDispatch) {
    btnQuickDispatch.addEventListener('click', () => switchTab('campaigns'));
  }

  const btnAddConstituent = document.getElementById('btnAddConstituent');
  if (btnAddConstituent) {
    btnAddConstituent.addEventListener('click', () => openModal('modalAddConstituent'));
  }

  const btnOpenSql = document.getElementById('btnOpenSqlRunner');
  if (btnOpenSql) {
    btnOpenSql.addEventListener('click', () => switchTab('schema'));
  }

  // Theme Toggle Initialization
  initThemeToggle();

  // Initial Data Fetch
  fetchStats();

  // Start real-time telemetry polling every 3.5s
  setInterval(updateLiveTelemetry, 3500);
});

// ========================================================
// THEME TOGGLE LOGIC (Light / Dark Mode)
// ========================================================
function initThemeToggle() {
  const savedTheme = localStorage.getItem('talk_sasa_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeToggleButtons(savedTheme);

  const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('talk_sasa_theme', nextTheme);
      updateThemeToggleButtons(nextTheme);
      showToast(`Switched to ${nextTheme === 'dark' ? 'Dark Pine' : 'Warm Cream'} Theme`, 'info');
    });
  });
}

function updateThemeToggleButtons(theme) {
  const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
  toggleBtns.forEach(btn => {
    if (theme === 'dark') {
      btn.innerHTML = `<span>☀️</span> <span class="theme-text">Light Mode</span>`;
      btn.setAttribute('title', 'Switch to Light Mode');
    } else {
      btn.innerHTML = `<span>🌙</span> <span class="theme-text">Dark Mode</span>`;
      btn.setAttribute('title', 'Switch to Dark Mode');
    }
  });
}

// ========================================================
// UNIVERSAL IMAGE REPLACEMENT SYSTEM
// ========================================================
function initUniversalImageReplacer() {
  const universalInput = document.getElementById('universalImageInput');
  if (!universalInput) return;

  universalInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    showToast('Uploading and updating image...', 'info');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData
      });
      const json = await res.json();

      if (json.success && json.url) {
        const target = window.activePhotoUploadTarget;

        if (target && target.type === 'rally') {
          // Persist rally photo in database
          await fetch(`/api/rallies/${target.id}/photo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoUrl: json.url })
          });

          const rallyImg = document.getElementById(`rallyImg_${target.id}`);
          if (rallyImg) rallyImg.src = json.url;
          showToast('Rally event photo updated successfully!', 'success');
          if (window.loadRallies) window.loadRallies();
        } else if (target && target.type === 'img' && target.element) {
          target.element.src = json.url;
          showToast('Image replaced successfully!', 'success');
        } else {
          showToast('Image uploaded successfully!', 'success');
        }
      } else {
        showToast(json.error || 'Failed to upload image.', 'error');
      }
    } catch (err) {
      console.error('Image replacement error:', err);
      showToast('Network error during image replacement.', 'error');
    }
  });

  // Make all social preview images replaceable
  const socialImages = document.querySelectorAll('.social-post-image, .social-avatar, .x-header img');
  socialImages.forEach(img => {
    img.style.cursor = 'pointer';
    img.setAttribute('title', 'Click to replace this image');
    img.addEventListener('click', () => {
      triggerImageReplacement(img);
    });
  });
}

function triggerImageReplacement(imgElement) {
  window.activePhotoUploadTarget = { type: 'img', element: imgElement };
  const input = document.getElementById('universalImageInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

// Add initUniversalImageReplacer call on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  initUniversalImageReplacer();
});

window.state = state;
window.showToast = showToast;
window.openModal = openModal;
window.closeModal = closeModal;
window.switchTab = switchTab;
window.fetchStats = fetchStats;
window.initThemeToggle = initThemeToggle;
window.triggerImageReplacement = triggerImageReplacement;
window.initUniversalImageReplacer = initUniversalImageReplacer;
