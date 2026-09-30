// ========================================================
// POLITICAL RALLIES & MOBILIZATION MODULE
// ========================================================

async function loadRallies() {
  try {
    const res = await fetch('/api/rallies');
    const json = await res.json();
    if (json.success) {
      window.state.rallies = json.data;
      renderRalliesGrid(json.data);
    }
  } catch (err) {
    console.error('Failed to load rallies:', err);
    window.showToast('Could not load rally events', 'error');
  }
}

function renderRalliesGrid(rallies) {
  const container = document.getElementById('ralliesGridContainer');
  if (!container) return;

  if (rallies.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); padding: 2rem;">No political rallies scheduled yet.</div>`;
    return;
  }

  container.innerHTML = rallies.map(r => {
    const dateFormatted = new Date(r.rally_date).toLocaleDateString('en-KE', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const percentTurnout = Math.min(100, Math.round(((r.actual_rsvps || 0) / (r.expected_turnout || 1)) * 100));
    const imageUrl = r.image_url || 'assets/banner.jpg';

    return `
      <div class="rally-card" data-rally-id="${r.id}">
        <div class="replaceable-img-wrapper" style="width: 100%; height: 180px; position: relative; overflow: hidden;">
          <img src="${imageUrl}" alt="${r.rally_title}" class="rally-banner-img" id="rallyImg_${r.id}">
          <button type="button" class="btn-change-photo-overlay" onclick="triggerRallyPhotoUpload('${r.id}')" title="Change Rally Photo">
            📷 Change Photo
          </button>
        </div>
        <div class="rally-content">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
            <span class="badge ${r.status === 'upcoming' ? 'badge-gold' : 'badge-forest'}">${r.status}</span>
            <span class="badge badge-forest">${r.ward}</span>
          </div>

          <h4 class="rally-title">${r.rally_title}</h4>

          <div class="rally-meta-row">
            <span>📍</span>
            <span><strong>${r.venue}</strong></span>
          </div>

          <div class="rally-meta-row">
            <span>📅</span>
            <span>${dateFormatted}</span>
          </div>

          <div class="rally-meta-row">
            <span>🎙️</span>
            <span>Guest: ${r.chief_guest}</span>
          </div>

          <!-- Turnout Progress -->
          <div class="turnout-bar-wrapper">
            <div class="turnout-labels">
              <span>Confirmed RSVPs: <strong style="color: var(--text-primary); font-weight: 800;">${(r.actual_rsvps || 0).toLocaleString()}</strong></span>
              <span>Target: ${(r.expected_turnout || 5000).toLocaleString()}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${percentTurnout}%;"></div>
            </div>
          </div>

          <!-- Actions -->
          <div style="display: flex; gap: 0.6rem; margin-top: 1rem;">
            <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="rsvpToRally('${r.id}')">
              + Quick RSVP
            </button>
            <button class="btn btn-pill-forest btn-sm" style="flex: 1.2; justify-content: center;" onclick="launchRallySmsBlitz('${r.id}', '${encodeURIComponent(r.rally_title)}', '${r.ward}', '${encodeURIComponent(r.venue)}')">
              ⚡ Ward SMS Blitz
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function rsvpToRally(rallyId) {
  try {
    const res = await fetch(`/api/rallies/${rallyId}/rsvp`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      window.showToast(`RSVP registered for rally! Count updated.`, 'success');
      loadRallies();
      if (window.fetchStats) window.fetchStats();
    }
  } catch (err) {
    window.showToast('Failed to log RSVP', 'error');
  }
}

function launchRallySmsBlitz(rallyId, titleEnc, ward, venueEnc) {
  const title = decodeURIComponent(titleEnc);
  const venue = decodeURIComponent(venueEnc);

  // Switch to campaigns tab with pre-filled details
  window.switchTab('campaigns');

  setTimeout(() => {
    const nameInput = document.getElementById('campaignNameInput');
    const msgInput = document.getElementById('campaignMessageInput');
    const wardSelect = document.getElementById('campaignWardSelect');

    if (nameInput) nameInput.value = `Ward Mobilization: ${title}`;
    if (wardSelect && ward) wardSelect.value = ward;
    if (msgInput) {
      msgInput.value = `Habari {first_name}, Kiongozi wetu Hon. Ledirama atakua ${venue} katika wadi ya ${ward}. Kura yako ndio sauti yako ya mabadiliko! Njoo na jirani yako.`;
    }

    if (window.updateCampaignPreview) window.updateCampaignPreview();
    window.showToast(`Campaign pre-configured for ${ward} rally blitz!`, 'info');
  }, 200);
}

// Trigger changing photo on an existing rally card
function triggerRallyPhotoUpload(rallyId) {
  window.activePhotoUploadTarget = { type: 'rally', id: rallyId };
  const input = document.getElementById('universalImageInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

async function handleCreateRallySubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const titleInput = document.getElementById('rallyTitleInput');
  const venueInput = document.getElementById('rallyVenueInput');
  const wardSelect = document.getElementById('rallyWardSelect');
  const dateInput = document.getElementById('rallyDateInput');
  const guestInput = document.getElementById('rallyGuestInput');
  const turnoutInput = document.getElementById('rallyTurnoutInput');
  const photoHidden = document.getElementById('rallyPhotoUrlHidden');
  const fileInput = document.getElementById('rallyPhotoFileInput');

  const title = titleInput ? titleInput.value.trim() : '';
  const venue = venueInput ? venueInput.value.trim() : '';
  const ward = wardSelect ? wardSelect.value : 'Narok Town';
  const rallyDate = dateInput ? dateInput.value : '';
  const guest = guestInput ? guestInput.value.trim() : '';
  const turnout = turnoutInput ? parseInt(turnoutInput.value, 10) : 5000;

  if (!title || !venue || !rallyDate) {
    window.showToast('Please fill in all required rally details.', 'error');
    return;
  }

  let finalPhotoUrl = photoHidden ? photoHidden.value : '';

  // If a file was picked in the modal but not yet uploaded, upload now
  if (!finalPhotoUrl && fileInput && fileInput.files && fileInput.files[0]) {
    try {
      window.showToast('Uploading rally poster photo...', 'info');
      const formData = new FormData();
      formData.append('image', fileInput.files[0]);
      const upRes = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData
      });
      const upJson = await upRes.json();
      if (upJson.success) {
        finalPhotoUrl = upJson.url;
      }
    } catch (err) {
      console.warn('Could not upload photo file, defaulting to standard banner:', err);
    }
  }

  try {
    const res = await fetch('/api/rallies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rally_title: title,
        venue,
        ward,
        rally_date: new Date(rallyDate).toISOString(),
        chief_guest: guest,
        expected_turnout: turnout,
        image_url: finalPhotoUrl || 'assets/banner.jpg'
      })
    });

    const json = await res.json();
    if (json.success) {
      window.showToast(`Political Rally "${title}" scheduled in ${ward}!`, 'success');
      window.closeModal('modalScheduleRally');
      document.getElementById('formRally').reset();
      resetRallyModalPhotoPreview();
      loadRallies();
      if (window.fetchStats) window.fetchStats();
    } else {
      window.showToast(json.error || 'Failed to schedule rally', 'error');
    }
  } catch (err) {
    window.showToast('Network error scheduling rally', 'error');
  }
}

function resetRallyModalPhotoPreview() {
  const fileInput = document.getElementById('rallyPhotoFileInput');
  const hiddenInput = document.getElementById('rallyPhotoUrlHidden');
  const previewBox = document.getElementById('rallyPhotoUploadBox');
  const previewContainer = document.getElementById('rallyPhotoPreviewContainer');
  const previewImg = document.getElementById('rallyPhotoPreviewImg');
  const statusText = document.getElementById('rallyPhotoStatusText');

  if (fileInput) fileInput.value = '';
  if (hiddenInput) hiddenInput.value = '';
  if (previewImg) previewImg.src = '';
  if (previewContainer) previewContainer.style.display = 'none';
  if (previewBox) previewBox.style.display = 'block';
  if (statusText) statusText.textContent = 'Choose or Take Rally Photo';
}

function initRallyPhotoHandlers() {
  const fileInput = document.getElementById('rallyPhotoFileInput');
  const btnRemove = document.getElementById('btnRemoveRallyPhoto');
  const previewBox = document.getElementById('rallyPhotoUploadBox');
  const previewContainer = document.getElementById('rallyPhotoPreviewContainer');
  const previewImg = document.getElementById('rallyPhotoPreviewImg');
  const hiddenInput = document.getElementById('rallyPhotoUrlHidden');

  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      // Local preview immediately
      const reader = new FileReader();
      reader.onload = (re) => {
        if (previewImg) previewImg.src = re.target.result;
        if (previewBox) previewBox.style.display = 'none';
        if (previewContainer) previewContainer.style.display = 'block';
      };
      reader.readAsDataURL(file);

      // Upload in background to get server path
      try {
        const formData = new FormData();
        formData.append('image', file);
        const upRes = await fetch('/api/upload-image', {
          method: 'POST',
          body: formData
        });
        const upJson = await upRes.json();
        if (upJson.success && hiddenInput) {
          hiddenInput.value = upJson.url;
          window.showToast('Rally photo uploaded successfully!', 'success');
        }
      } catch (err) {
        console.error('Photo pre-upload error:', err);
      }
    });
  }

  if (btnRemove) {
    btnRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      resetRallyModalPhotoPreview();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btnOpenModal = document.getElementById('btnCreateRallyModal');
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => {
      // Set default datetime to tomorrow 10am
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);
      tomorrow.setHours(10, 0, 0, 0);
      const isoStr = tomorrow.toISOString().slice(0, 16);
      const dateInput = document.getElementById('rallyDateInput');
      if (dateInput) dateInput.value = isoStr;

      resetRallyModalPhotoPreview();
      window.openModal('modalScheduleRally');
    });
  }

  const btnSubmit = document.getElementById('btnSubmitRally');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', handleCreateRallySubmit);
  }

  initRallyPhotoHandlers();
});

window.loadRallies = loadRallies;
window.rsvpToRally = rsvpToRally;
window.launchRallySmsBlitz = launchRallySmsBlitz;
window.triggerRallyPhotoUpload = triggerRallyPhotoUpload;
