// ========================================================
// CONSTITUENTS CRM & WARD SEGMENTATION MODULE
// ========================================================

async function loadCrmData() {
  const searchInput = document.getElementById('crmSearchInput');
  const wardSelect = document.getElementById('crmWardFilter');
  const optSelect = document.getElementById('crmOptFilter');

  const search = searchInput ? searchInput.value : '';
  const ward = wardSelect ? wardSelect.value : 'all';
  const opt = optSelect ? optSelect.value : 'all';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (ward && ward !== 'all') params.append('ward', ward);
  if (opt && opt !== 'all') params.append('is_opted_out', opt);
  params.append('limit', '100');

  try {
    const res = await fetch(`/api/constituents?${params.toString()}`);
    const json = await res.json();
    if (json.success) {
      window.state.allConstituents = json.constituents;
      renderConstituentsTable(json.constituents);
      const countEl = document.getElementById('crmFilteredCount');
      if (countEl) countEl.textContent = json.total;
    }
  } catch (err) {
    console.error('Failed to load constituents:', err);
    window.showToast('Failed to load constituent records', 'error');
  }
}

function renderConstituentsTable(list) {
  const tbody = document.getElementById('constituentsTableBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-muted);">
          No constituents found matching your segmentation criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr>
      <td>
        <strong style="color: #fff;">${c.first_name} ${c.last_name}</strong>
      </td>
      <td class="cell-mono">${c.phone_number}</td>
      <td class="cell-mono">${c.national_id || '—'}</td>
      <td>
        <span class="badge badge-blue">${c.ward}</span>
      </td>
      <td style="color: var(--text-secondary); font-size: 0.78rem;">
        ${c.polling_station || 'County Primary'}
      </td>
      <td>
        <span class="badge ${c.voter_status === 'youth_first_time' ? 'badge-amber' : (c.voter_status === 'elder' ? 'badge-purple' : 'badge-green')}">
          ${c.voter_status.replace(/_/g, ' ')}
        </span>
        <div style="margin-top: 0.2rem;">
          ${(c.tags || []).map(t => `<span class="voter-tag">${t}</span>`).join('')}
        </div>
      </td>
      <td>
        <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; color: var(--text-secondary);">
          ${c.preferred_channel || 'sms'}
        </span>
      </td>
      <td>
        <button 
          class="optout-toggle-btn ${c.is_opted_out ? 'opted-out' : ''}" 
          onclick="toggleConstituentOptOut('${c.id}', ${!c.is_opted_out})"
          title="Click to toggle opt status">
          ${c.is_opted_out ? '❌ Opted Out' : '✅ Active'}
        </button>
      </td>
      <td>
        <button 
          class="btn btn-outline btn-sm" 
          style="padding: 0.2rem 0.5rem; font-size: 0.72rem; color: var(--accent-red); border-color: rgba(239, 68, 68, 0.3);" 
          onclick="deleteConstituentRecord('${c.id}')"
          title="Delete voter record">
          Delete
        </button>
      </td>
    </tr>
  `).join('');
}

async function toggleConstituentOptOut(id, newStatus) {
  try {
    const res = await fetch(`/api/constituents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_opted_out: newStatus })
    });
    const json = await res.json();
    if (json.success) {
      window.showToast(`Updated opt status: ${newStatus ? 'Voter Opted-Out' : 'Voter Opted-In'}`, 'success');
      loadCrmData();
      if (window.fetchStats) window.fetchStats();
    } else {
      window.showToast(json.error || 'Failed to update voter status', 'error');
    }
  } catch (err) {
    window.showToast('Network error updating opt-out status', 'error');
  }
}

async function deleteConstituentRecord(id) {
  if (!confirm('Are you sure you want to remove this constituent from the Narok campaign registry?')) {
    return;
  }

  try {
    const res = await fetch(`/api/constituents/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      window.showToast('Constituent removed from registry', 'success');
      loadCrmData();
      if (window.fetchStats) window.fetchStats();
    } else {
      window.showToast(json.error || 'Could not delete record', 'error');
    }
  } catch (err) {
    window.showToast('Network error during deletion', 'error');
  }
}

// Add Constituent Form Submission
async function handleAddConstituentSubmit(e) {
  e.preventDefault();
  const firstName = document.getElementById('constFirstName').value.trim();
  const lastName = document.getElementById('constLastName').value.trim();
  const phone = document.getElementById('constPhone').value.trim();
  const nationalId = document.getElementById('constNationalId').value.trim();
  const ward = document.getElementById('constWard').value;
  const polling = document.getElementById('constPolling').value.trim();
  const voterStatus = document.getElementById('constVoterStatus').value;
  const channel = document.getElementById('constChannel').value;
  const tagsRaw = document.getElementById('constTags').value.trim();

  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : ['field_registration'];

  try {
    const res = await fetch('/api/constituents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        phone_number: phone,
        national_id: nationalId,
        ward,
        polling_station: polling,
        voter_status: voterStatus,
        preferred_channel: channel,
        tags
      })
    });

    const json = await res.json();
    if (json.success) {
      window.showToast(`Voter ${firstName} ${lastName} added successfully to ${ward}!`, 'success');
      window.closeModal('modalAddConstituent');
      document.getElementById('formAddConstituent').reset();
      loadCrmData();
      if (window.fetchStats) window.fetchStats();
    } else {
      window.showToast(json.error || 'Validation error adding constituent', 'error');
    }
  } catch (err) {
    window.showToast('Network error saving constituent', 'error');
  }
}

// CSV Export
function exportConstituentsCsv() {
  const records = window.state.allConstituents || [];
  if (records.length === 0) {
    window.showToast('No records to export', 'error');
    return;
  }

  const headers = ['First Name', 'Last Name', 'Phone Number', 'National ID', 'County', 'Ward', 'Polling Station', 'Opted Out', 'Voter Status', 'Channel'];
  const rows = records.map(c => [
    `"${c.first_name}"`,
    `"${c.last_name}"`,
    `"${c.phone_number}"`,
    `"${c.national_id || ''}"`,
    `"${c.county || 'Narok'}"`,
    `"${c.ward || ''}"`,
    `"${c.polling_station || ''}"`,
    c.is_opted_out ? 'TRUE' : 'FALSE',
    `"${c.voter_status || 'registered'}"`,
    `"${c.preferred_channel || 'sms'}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `narok_constituents_export_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.showToast(`Exported ${records.length} voter records to CSV`, 'success');
}

// Bulk CSV Import simulation
async function simulateBulkImport() {
  const sampleVoters = [
    { first_name: 'Daniel', last_name: 'Ole Senteu', phone_number: '+254711998811', ward: 'Kilgoris Central', voter_status: 'elder' },
    { first_name: 'Resiato', last_name: 'Nashipae', phone_number: '+254722881122', ward: 'Narok Town', voter_status: 'youth_first_time' },
    { first_name: 'Kiprotich', last_name: 'Cheruiyot', phone_number: '+254700112233', ward: 'Suswa', voter_status: 'registered' },
    { first_name: 'Naisula', last_name: 'Sanare', phone_number: '+254719223344', ward: 'Melili', voter_status: 'registered' },
    { first_name: 'Moitalel', last_name: 'Kapunkei', phone_number: '+254791445566', ward: 'Shankoe', voter_status: 'youth_first_time' }
  ];

  try {
    const res = await fetch('/api/constituents/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: sampleVoters })
    });
    const json = await res.json();
    if (json.success) {
      window.showToast(`Imported ${json.imported} new voter records (${json.skipped} duplicate skipped)`, 'success');
      loadCrmData();
      if (window.fetchStats) window.fetchStats();
    }
  } catch (err) {
    window.showToast('Error during bulk import', 'error');
  }
}

// Event Listeners for CRM
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('crmSearchInput');
  const wardFilter = document.getElementById('crmWardFilter');
  const optFilter = document.getElementById('crmOptFilter');

  if (searchInput) {
    let timeout = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(loadCrmData, 250);
    });
  }

  if (wardFilter) wardFilter.addEventListener('change', loadCrmData);
  if (optFilter) optFilter.addEventListener('change', loadCrmData);

  const btnExport = document.getElementById('btnExportCsv');
  if (btnExport) btnExport.addEventListener('click', exportConstituentsCsv);

  const btnImport = document.getElementById('btnImportCsv');
  if (btnImport) btnImport.addEventListener('click', simulateBulkImport);

  const btnSubmitAdd = document.getElementById('btnSubmitAddConstituent');
  if (btnSubmitAdd) btnSubmitAdd.addEventListener('click', handleAddConstituentSubmit);
});

window.loadCrmData = loadCrmData;
window.toggleConstituentOptOut = toggleConstituentOptOut;
window.deleteConstituentRecord = deleteConstituentRecord;
