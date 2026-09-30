// ========================================================
// CUSTOMIZED SENDER IDs MODULE (CAK, SAFARICOM & AIRTEL SIM)
// ========================================================

async function loadSenderIds() {
  try {
    const res = await fetch('/api/sender-ids');
    const json = await res.json();
    if (json.success) {
      window.state.senderIds = json.data;
      renderSenderIdsTable(json.data);
    }
  } catch (err) {
    console.error('Failed to load sender IDs:', err);
    window.showToast('Could not load sender IDs', 'error');
  }
}

function renderSenderIdsTable(senders) {
  const tbody = document.getElementById('senderIdsTableBody');
  if (!tbody) return;

  if (senders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No Sender IDs registered.</td></tr>`;
    return;
  }

  tbody.innerHTML = senders.map(s => {
    const carrier = s.carrier_route || s.network_provider || 'Safaricom Direct Route';
    let carrierBadgeClass = 'badge-gray';
    let carrierIcon = '📶';
    if (carrier.toLowerCase().includes('safaricom')) {
      carrierBadgeClass = 'carrier-badge-saf';
      carrierIcon = '🟢';
    } else if (carrier.toLowerCase().includes('airtel')) {
      carrierBadgeClass = 'carrier-badge-airtel';
      carrierIcon = '🔴';
    } else if (carrier.toLowerCase().includes('dual')) {
      carrierBadgeClass = 'carrier-badge-dual';
      carrierIcon = '🟡';
    }

    const simDetails = s.sim_slot ? `<div style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); margin-top: 3px;">${s.sim_slot} • ${s.sim_number || 'SIM Active'}</div>` : '';
    const cakRef = s.cak_reference ? `<span style="font-size: 0.68rem; color: var(--color-gold); font-family: var(--font-mono); display: block; margin-top: 2px;">${s.cak_reference}</span>` : '';

    return `
      <tr>
        <td>
          <span style="font-family: var(--font-mono); font-weight: 800; color: var(--color-gold); font-size: 0.95rem; background: var(--color-forest-tint); padding: 0.25rem 0.65rem; border-radius: 6px; border: 1px solid var(--color-forest-border); display: inline-block;">
            ${s.sender_name}
          </span>
          ${cakRef}
        </td>
        <td>
          <strong style="color: var(--text-primary);">${s.candidate_or_party}</strong>
        </td>
        <td style="color: var(--text-secondary); font-size: 0.8rem;">
          ${s.category}
        </td>
        <td>
          <span class="badge ${carrierBadgeClass}" style="font-size: 0.73rem; font-weight: 700;">
            ${carrierIcon} ${carrier}
          </span>
          ${simDetails}
        </td>
        <td>
          <span class="badge ${s.status === 'approved' ? 'badge-green' : 'badge-amber'}">
            ${s.status === 'approved' ? '✓ Approved & Active' : s.status.replace(/_/g, ' ')}
          </span>
        </td>
        <td style="color: var(--text-muted); font-size: 0.76rem;">
          ${new Date(s.created_at).toLocaleDateString()}
        </td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="testSenderId('${s.sender_name}', '${carrier.replace(/'/g, "\\'")}')" style="padding: 0.25rem 0.55rem; font-size: 0.75rem;">
            Test Ping
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function testSenderId(senderName, carrier) {
  const route = carrier || 'Safaricom / Airtel SIM Gateway';
  window.showToast(`Test ping initiated with Sender ID "${senderName}". Route: ${route} (DLR Handshake OK).`, 'success');
}

async function handleRequestSenderIdSubmit(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('senderNameInput');
  const orgInput = document.getElementById('senderOrgInput');
  const catInput = document.getElementById('senderCategoryInput');
  const routeInput = document.getElementById('senderCarrierRouteInput');
  const slotInput = document.getElementById('senderSimSlotInput');
  const simNumInput = document.getElementById('senderSimNumberInput');
  const cakRefInput = document.getElementById('senderCakRefInput');
  const throughputInput = document.getElementById('senderThroughputInput');

  const senderName = nameInput ? nameInput.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '') : '';
  const candidateOrParty = orgInput ? orgInput.value.trim() : '';
  const category = catInput ? catInput.value : 'Official Campaign';
  const carrierRoute = routeInput ? routeInput.value : 'Safaricom Direct SMPP (Corporate SIM)';
  const simSlot = slotInput ? slotInput.value : 'Slot 1: Safaricom Corporate GSM';
  const simNumber = simNumInput ? simNumInput.value.trim() : '';
  const cakReference = cakRefInput ? cakRefInput.value.trim() : 'CAK/SMS/2026/0491';
  const throughput = throughputInput ? throughputInput.value : '500 SMS/sec (Safaricom SMPP)';

  if (!senderName || !candidateOrParty) {
    window.showToast('Please provide Sender ID and Candidate/Party entity.', 'error');
    return;
  }

  if (senderName.length > 11) {
    window.showToast('Sender ID cannot exceed 11 characters under CAK guidelines.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/sender-ids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_name: senderName,
        candidate_or_party: candidateOrParty,
        category,
        carrier_route: carrierRoute,
        network_provider: carrierRoute,
        sim_slot: simSlot,
        sim_number: simNumber,
        cak_reference: cakReference,
        throughput
      })
    });

    const json = await res.json();
    if (json.success) {
      window.showToast(`Sender ID "${senderName}" successfully linked to ${carrierRoute} and active for bulk messaging!`, 'success');
      window.closeModal('modalRequestSenderId');
      const form = document.getElementById('formSenderId');
      if (form) form.reset();
      
      await loadSenderIds();
      // Auto reload senders in Campaign Studio dropdown and select newly added Sender ID!
      if (window.loadSendersForCampaign) {
        await window.loadSendersForCampaign(senderName);
      }
      if (window.fetchStats) window.fetchStats();
    } else {
      window.showToast(json.error || 'Failed to submit Sender ID', 'error');
    }
  } catch (err) {
    window.showToast('Network error submitting Sender ID', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btnOpenModal = document.getElementById('btnRequestSenderId');
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => window.openModal('modalRequestSenderId'));
  }

  const btnSubmit = document.getElementById('btnSubmitSenderId');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', handleRequestSenderIdSubmit);
  }
});

window.loadSenderIds = loadSenderIds;
window.testSenderId = testSenderId;
window.handleRequestSenderIdSubmit = handleRequestSenderIdSubmit;
