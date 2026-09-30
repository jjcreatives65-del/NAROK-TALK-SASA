// ========================================================
// EXCEL & SPREADSHEET VOTER DATABASE IMPORTER MODULE
// Ingests .xlsx, .xls, and .csv contact databases into Narok CRM
// ========================================================

let currentExcelFile = null;
let currentParsedRecords = [];

function initExcelUpload() {
  const dropZone = document.getElementById('excelDropZone');
  const fileInput = document.getElementById('excelFileInput');
  const btnBrowse = document.getElementById('btnBrowseExcel');
  const btnDownloadTemplate = document.getElementById('btnDownloadExcelTemplate');
  const btnConfirmImport = document.getElementById('btnConfirmExcelImport');

  if (btnBrowse && fileInput) {
    btnBrowse.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processSelectedExcelFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        processSelectedExcelFile(fileInput.files[0]);
      }
    });
  }

  if (btnDownloadTemplate) {
    btnDownloadTemplate.addEventListener('click', downloadExcelTemplate);
  }

  if (btnConfirmImport) {
    btnConfirmImport.addEventListener('click', executeExcelDatabaseImport);
  }
}

function processSelectedExcelFile(file) {
  if (!file) return;

  const validExts = ['.xlsx', '.xls', '.csv'];
  const fileName = file.name.toLowerCase();
  const isValid = validExts.some(ext => fileName.endsWith(ext));

  if (!isValid) {
    window.showToast('Please upload a valid Excel spreadsheet (.xlsx, .xls) or CSV file.', 'error');
    return;
  }

  currentExcelFile = file;

  // Update UI badge
  const fileBadge = document.getElementById('excelSelectedFileBadge');
  const fileNameEl = document.getElementById('excelFileNameText');
  const fileSizeEl = document.getElementById('excelFileSizeText');

  if (fileNameEl) fileNameEl.textContent = file.name;
  if (fileSizeEl) fileSizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;
  if (fileBadge) fileBadge.style.display = 'inline-flex';

  // Read and parse preview using client-side SheetJS if available, or FileReader
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      if (typeof XLSX !== 'undefined') {
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const rawJson = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });
        previewParsedRecords(rawJson);
      } else {
        // Fallback simple preview notification
        window.showToast(`Excel file "${file.name}" loaded and ready to import.`, 'info');
        enableImportButton(true);
      }
    } catch (err) {
      console.error('Error reading Excel locally:', err);
      enableImportButton(true);
    }
  };
  reader.readAsArrayBuffer(file);
}

function previewParsedRecords(rawRows) {
  currentParsedRecords = [];
  const previewContainer = document.getElementById('excelPreviewSection');
  const tbody = document.getElementById('excelPreviewTableBody');
  const totalCountEl = document.getElementById('excelTotalParsedCount');
  const validCountEl = document.getElementById('excelValidPhoneCount');

  if (!rawRows || rawRows.length === 0) {
    window.showToast('Excel sheet is empty.', 'error');
    return;
  }

  let validPhones = 0;
  rawRows.forEach((row, idx) => {
    let phone = '';
    let first = '';
    let last = '';
    let idNum = '';
    let ward = '';
    let polling = '';
    let status = 'registered';
    let channel = 'sms';

    for (const [key, val] of Object.entries(row)) {
      const k = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const v = String(val).trim();

      if (k.includes('phone') || k.includes('mobile') || k.includes('contact') || k.includes('simu') || k === 'tel') {
        phone = v;
      } else if (k.includes('first') || k === 'fname') {
        first = v;
      } else if (k.includes('last') || k === 'lname' || k.includes('surname')) {
        last = v;
      } else if (k === 'name' || k === 'fullname') {
        const parts = v.split(/\s+/);
        first = parts[0] || '';
        last = parts.slice(1).join(' ') || '';
      } else if (k.includes('id') || k.includes('national')) {
        idNum = v;
      } else if (k.includes('ward') || k.includes('wadi')) {
        ward = v;
      } else if (k.includes('polling') || k.includes('kituo')) {
        polling = v;
      } else if (k.includes('status')) {
        status = v;
      } else if (k.includes('channel')) {
        channel = v;
      }
    }

    if (phone) {
      validPhones++;
      currentParsedRecords.push({
        phone_number: phone,
        first_name: first || `Voter ${idx + 1}`,
        last_name: last,
        national_id: idNum,
        ward: ward || 'Narok Town',
        polling_station: polling || 'Ward Center',
        voter_status: status,
        preferred_channel: channel
      });
    }
  });

  if (totalCountEl) totalCountEl.textContent = rawRows.length;
  if (validCountEl) validCountEl.textContent = validPhones;
  if (previewContainer) previewContainer.style.display = 'block';

  // Render top 10 preview rows
  if (tbody) {
    const previewList = currentParsedRecords.slice(0, 8);
    tbody.innerHTML = previewList.map(r => `
      <tr>
        <td><strong>${r.first_name} ${r.last_name}</strong></td>
        <td class="cell-mono">${r.phone_number}</td>
        <td class="cell-mono">${r.national_id || '—'}</td>
        <td><span class="badge badge-amber">${r.ward}</span></td>
        <td style="font-size: 0.78rem;">${r.polling_station}</td>
        <td><span class="badge badge-blue">${r.voter_status}</span></td>
      </tr>
    `).join('');
  }

  enableImportButton(true);
  window.showToast(`Excel file analyzed: ${validPhones} valid voter records identified.`, 'success');
}

function enableImportButton(enabled) {
  const btnConfirm = document.getElementById('btnConfirmExcelImport');
  if (btnConfirm) {
    btnConfirm.disabled = !enabled;
    if (enabled) {
      btnConfirm.classList.remove('btn-secondary');
      btnConfirm.classList.add('btn-primary');
    }
  }
}

async function executeExcelDatabaseImport() {
  if (!currentExcelFile) {
    window.showToast('Please select an Excel file first.', 'error');
    return;
  }

  const btnConfirm = document.getElementById('btnConfirmExcelImport');
  const originalText = btnConfirm ? btnConfirm.innerHTML : 'Import';

  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = `<span>⏳ Ingesting Database...</span>`;
  }

  try {
    const formData = new FormData();
    formData.append('file', currentExcelFile);

    const res = await fetch('/api/constituents/upload-excel', {
      method: 'POST',
      body: formData
    });

    const json = await res.json();
    if (json.success) {
      window.showToast(`🎉 Successfully ingested ${json.imported} new voters into Narok CRM (${json.skipped} duplicates skipped)!`, 'success');

      // Refresh CRM data and statistics
      if (window.loadCrmData) window.loadCrmData();
      if (window.fetchStats) window.fetchStats();

      // Show summary banner
      const summaryBanner = document.getElementById('excelImportSuccessBanner');
      if (summaryBanner) {
        summaryBanner.style.display = 'block';
        summaryBanner.innerHTML = `
          <div style="background: rgba(198, 146, 85, 0.2); border: 1.5px solid var(--accent-camel); border-radius: var(--radius-lg); padding: 1.25rem; margin-top: 1.5rem; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <h4 style="color: var(--color-ivory); font-size: 1.1rem; font-weight: 700;">Database Import Complete!</h4>
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.25rem;">
                File: <strong>${json.fileName}</strong> | Added: <strong style="color: var(--color-ivory);">${json.imported}</strong> voters | Total in Registry: <strong style="color: var(--accent-camel);">${json.totalNow.toLocaleString()}</strong>
              </p>
            </div>
            <button class="btn btn-outline btn-sm" onclick="window.switchTab('crm')">
              View in CRM Directory →
            </button>
          </div>
        `;
      }
    } else {
      window.showToast(json.error || 'Failed to import Excel file', 'error');
    }
  } catch (err) {
    console.error('Database import error:', err);
    window.showToast('Network error during Excel upload', 'error');
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = originalText;
    }
  }
}

function downloadExcelTemplate() {
  window.open('/api/constituents/download-template', '_blank');
  window.showToast('Official Narok Excel Voter Database Template downloaded.', 'info');
}

document.addEventListener('DOMContentLoaded', initExcelUpload);

window.initExcelUpload = initExcelUpload;
window.downloadExcelTemplate = downloadExcelTemplate;
window.executeExcelDatabaseImport = executeExcelDatabaseImport;
