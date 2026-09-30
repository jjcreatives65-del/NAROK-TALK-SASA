// ========================================================
// OMNICHANNEL CAMPAIGN STUDIO MODULE
// Multi-channel Toggling, Message Writing & Broadcast Sharing
// ========================================================

const CHANNEL_CONFIGS = {
  sms: {
    name: 'Bulk SMS',
    subtitle: '160 Chars • Safaricom SMPP',
    icon: '📱',
    badgeClass: 'channel-badge-sms',
    routeName: 'Safaricom Direct SMPP (Corporate SIM)',
    gatewayName: "Safaricom & Africa's Talking Telecom",
    deliveryRate: '99.8% Successful (2.4s DLR)',
    senderLabel: 'Sender ID (CAK Approved)',
    senderSub: 'CAK Registered Alphanumeric Sender ID',
    defaultSender: 'NAROK_TALK',
    costPerUnit: 0.80,
    charLimit: 160,
    defaultMsg: 'Habari {first_name}, Kiongozi wetu Hon. Ledirama Ole Senteu atakua Kilgoris Stadium Alhamisi 10 AM. Tujumuike kwa pamoja kutetea maendeleo ya Narok! Kura Yako, Sauti Yako.'
  },
  whatsapp: {
    name: 'WhatsApp Business',
    subtitle: 'Interactive • Meta Cloud API',
    icon: '💬',
    badgeClass: 'channel-badge-whatsapp',
    routeName: 'Meta Cloud API Direct (Kenya Edge)',
    gatewayName: 'Meta Graph API Cloud Gateway',
    deliveryRate: '99.9% Delivered & Read Receipts',
    senderLabel: 'WhatsApp Verified Display Name',
    senderSub: 'Meta Verified Official Business Account',
    defaultSender: 'Narok Talk Sasa Official',
    costPerUnit: 0.50,
    charLimit: 1024,
    defaultMsg: 'Habari {first_name}! 🗳️ Karibu katika mkutano mkuu wa maendeleo ya Narok County viwanja vya Kilgoris Alhamisi hii kuanzia 10:00 AM.\n\n*Agenda Kuu:*\n1. Usambazaji wa Maji na Mabwawa ya Mifugo\n2. Ufadhili wa Elimu (Bursaries) kwa Vijana wa Narok\n3. Barabara za Vijijini na Soko la Kisasa\n\n_Kura Yako, Sauti Yako!_ Bonyeza vitufe hapa chini:'
  },
  email: {
    name: 'Email Newsletter',
    subtitle: 'Manifesto HTML • SMTP Relay',
    icon: '✉️',
    badgeClass: 'channel-badge-email',
    routeName: 'Authenticated SMTP Relay (TLS 1.3 / DKIM)',
    gatewayName: 'DKIM, SPF & DMARC Verified Relay',
    deliveryRate: '99.4% Primary Inbox Placement',
    senderLabel: 'Campaign Email Sender',
    senderSub: 'newsletters@naroktalksasa.ke',
    defaultSender: 'Hon. Ledirama Campaign Office <info@naroktalksasa.ke>',
    costPerUnit: 0.10,
    charLimit: 5000,
    defaultSubject: 'Taarifa Rasmi kwa Watu wa Narok: Mwongozo wa Maendeleo 2027',
    defaultMsg: 'Mwana Narok mpendwa {first_name},\n\nTunakualika kwa heshima katika Mkutano wa Uhamasishaji wa Narok Kusini utakaofanyika Alhamisi hii katika Viwanja vya Kilgoris.\n\nManifesto yetu inalenga:\n• Uboreshaji wa sekta ya kilimo na bei bora ya ngano na mahindi\n• Bima ya afya kwa wazee na kinamama wajawazito\n• Haki na usawa katika ugavi wa rasilimali za kaunti yetu\n\nTujumuike pamoja kujenga Narok mpya!\n\nWako mwaminifu,\nHon. Ledirama Ole Senteu Campaign Secretariat'
  },
  voice: {
    name: 'Voice IVR Call',
    subtitle: 'Swahili & Maa • SIP Audio',
    icon: '🎙️',
    badgeClass: 'channel-badge-voice',
    routeName: 'SIP Trunk Voice Dialers (E.164)',
    gatewayName: 'Telecom SIP Voice Gateway & Text-to-Speech',
    deliveryRate: '98.5% Call Connection & Audio Streamed',
    senderLabel: 'IVR Voice Caller ID',
    senderSub: 'Automated Swahili & Maa Voice Broadcast',
    defaultSender: '+254700000254 (Toll-Free Campaign Line)',
    costPerUnit: 1.50,
    charLimit: 800,
    defaultMsg: '[Swahili]: Habari mwananchi wa wadi ya {ward}. Hii ni sauti ya uongozi mpya wa Narok 2027. Ungana nasi Alhamisi hii katika viwanja vya Kilgoris. Piga 1 kuthibitisha kuhudhuria, au piga 2 kupokea manifesto kwa SMS.\n\n[Kimasai / Maa]: Sopa ilomon le Narok! Eitoki aaishiunye enkiroroto enye Kilgoris enkang ang...'
  },
  social: {
    name: 'Social Sync Ads',
    subtitle: 'Meta & X Audience Boost',
    icon: '📢',
    badgeClass: 'channel-badge-social',
    routeName: 'Meta Graph & X (Twitter) Ads API',
    gatewayName: 'SHA-256 Hashed Mobile Voter Custom Audience',
    deliveryRate: '88.5% Audience Match with Narok Voters',
    senderLabel: 'Sponsored Social Profile',
    senderSub: 'Meta Business & X Ads Verified Account',
    defaultSender: 'Narok County Coalition 2027',
    costPerUnit: 2.20,
    charLimit: 1200,
    defaultHeadline: 'Narok 2027: Mkutano wa Kihistoria Viwanja vya Kilgoris Alhamisi',
    defaultMsg: 'Watu wote wa wadi ya {ward}! Wakati wa kuleta uongozi thabiti na maendeleo mashinani umewadia. Hon. Ledirama Ole Senteu atakua nasi Kilgoris Stadium Alhamisi hii kuanzia saa nne asubuhi. Usikose fursa hii ya kihistoria! #NarokTalkSasa #Narok2027 #KilgorisRally #SenteuTena'
  }
};

let isVoicePlaying = false;
let voiceSynthesisUtterance = null;
let _campaignStudioInitialized = false;

function initCampaignStudio() {
  if (_campaignStudioInitialized) {
    // Already bound — just refresh data
    loadSendersForCampaign();
    recalculateRecipientsAndCost();
    updateCampaignPreview();
    return;
  }
  _campaignStudioInitialized = true;

  // 1. Channel Switcher Ribbon buttons
  const channelBtns = document.querySelectorAll('#campaignChannelSelector .channel-ribbon-btn, #campaignChannelSelector .channel-btn');
  channelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      channelBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const channel = btn.dataset.channel || 'sms';
      window.state.selectedChannel = channel;
      handleChannelChange(channel);
    });
  });

  // 2. Sender ID dropdown Change
  const senderSelect = document.getElementById('campaignSenderSelect');
  if (senderSelect) {
    senderSelect.addEventListener('change', () => {
      if (senderSelect.value === '__ADD_NEW_SENDER__') {
        // Active trigger to register new Sender ID
        window.openModal('modalRequestSenderId');
        senderSelect.value = window.state.selectedSenderId || (window.state.senderIds?.[0]?.sender_name || 'NAROK_TALK');
        return;
      }
      window.state.selectedSenderId = senderSelect.value;
      updateCampaignPreview();
    });
  }

  // 3. Ward selection change
  const wardSelect = document.getElementById('campaignWardSelect');
  if (wardSelect) {
    wardSelect.addEventListener('change', () => {
      recalculateRecipientsAndCost();
      updateCampaignPreview();
    });
  }

  // 4. Textarea input listener
  const msgInput = document.getElementById('campaignMessageInput');
  if (msgInput) {
    msgInput.addEventListener('input', () => {
      updateCampaignPreview();
    });
  }

  // 5. Personalization tag pills
  const tagPills = document.querySelectorAll('.var-tag-pill');
  tagPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const tag = pill.dataset.tag;
      if (msgInput && tag) {
        const start = msgInput.selectionStart;
        const end = msgInput.selectionEnd;
        const text = msgInput.value;
        msgInput.value = text.substring(0, start) + tag + text.substring(end);
        msgInput.focus();
        msgInput.selectionStart = msgInput.selectionEnd = start + tag.length;
        updateCampaignPreview();
      }
    });
  });

  // 6. Action Buttons: Send Now, Schedule, and Share Message
  const btnSendNow = document.getElementById('btnSendCampaignNow');
  if (btnSendNow) {
    btnSendNow.addEventListener('click', () => handleSendCampaign(true));
  }

  const btnSchedule = document.getElementById('btnScheduleCampaign');
  if (btnSchedule) {
    btnSchedule.addEventListener('click', () => handleSendCampaign(false));
  }

  const btnShare = document.getElementById('btnShareCampaign');
  if (btnShare) {
    btnShare.addEventListener('click', openShareBroadcastModal);
  }

  const btnInspectorShare = document.getElementById('btnInspectorQuickShare');
  if (btnInspectorShare) {
    btnInspectorShare.addEventListener('click', openShareBroadcastModal);
  }

  // 7. Wire Share Modal Buttons
  initShareModalListeners();

  // Load registered Sender IDs & Recipient Counts
  loadSendersForCampaign();
  recalculateRecipientsAndCost();
}

function handleChannelChange(channel) {
  const cfg = CHANNEL_CONFIGS[channel] || CHANNEL_CONFIGS.sms;
  const senderLabel = document.getElementById('campaignSenderLabel');
  const msgLabel = document.getElementById('campaignMessageLabel');
  const msgInput = document.getElementById('campaignMessageInput');
  const specificOptions = document.getElementById('channelSpecificOptions');

  if (senderLabel) {
    senderLabel.innerHTML = `<span>${cfg.senderLabel}</span> <span class="badge badge-gold" style="font-size: 0.65rem; padding: 0.1rem 0.4rem;">ACTIVE</span>`;
  }
  if (msgLabel) msgLabel.textContent = `${cfg.name} Content`;

  // Provide channel default message if empty or matching previous default
  if (msgInput) {
    const currentVal = msgInput.value.trim();
    const isAnyDefault = Object.values(CHANNEL_CONFIGS).some(c => c.defaultMsg.trim() === currentVal);
    if (!currentVal || isAnyDefault) {
      msgInput.value = cfg.defaultMsg;
    }
  }

  // Render channel specific UI additions
  if (specificOptions) {
    if (channel === 'whatsapp') {
      specificOptions.style.display = 'block';
      specificOptions.innerHTML = `
        <div style="background: var(--bg-input); border: 1.5px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.85rem;">
          <div style="font-size: 0.76rem; font-weight: 800; color: #059669; margin-bottom: 0.45rem; text-transform: uppercase; display: flex; align-items: center; gap: 0.4rem;">
            <span>💬</span> WhatsApp Interactive Quick Reply Buttons
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem;">
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 2px;">Button 1 (RSVP)</label>
              <input type="text" id="waBtn1Text" class="form-control" style="font-size: 0.78rem; padding: 0.4rem 0.6rem;" value="✅ Nitahudhuria (RSVP)" placeholder="Button 1 text" oninput="updateCampaignPreview()">
            </div>
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 2px;">Button 2 (Manifesto)</label>
              <input type="text" id="waBtn2Text" class="form-control" style="font-size: 0.78rem; padding: 0.4rem 0.6rem;" value="📄 Pakua Manifesto" placeholder="Button 2 text" oninput="updateCampaignPreview()">
            </div>
          </div>
        </div>
      `;
    } else if (channel === 'voice') {
      specificOptions.style.display = 'block';
      specificOptions.innerHTML = `
        <div style="background: var(--bg-input); border: 1.5px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.85rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem;">
            <div style="font-size: 0.76rem; font-weight: 800; color: #d97706; text-transform: uppercase; display: flex; align-items: center; gap: 0.4rem;">
              <span>🎙️</span> Voice Audio IVR Dialing Settings (Swahili & Maa)
            </div>
            <button type="button" class="btn btn-outline btn-xs" id="btnToggleVoiceAudio" onclick="toggleVoiceAudioPlayback()" style="font-size: 0.72rem; padding: 0.2rem 0.6rem; display: inline-flex; align-items: center; gap: 0.35rem;">
              <span id="voicePlayIcon">▶️</span> <span id="voicePlayText">Listen Spoken Demo</span>
            </button>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem;">
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 2px;">Language / Dialect Stream</label>
              <select id="voiceLanguageSelect" class="form-select" style="font-size: 0.78rem;" onchange="updateCampaignPreview()">
                <option value="bilingual">Kiswahili Sanifu & Kimasai (Maa)</option>
                <option value="swahili">Kiswahili Sanifu (Swahili Only)</option>
                <option value="maa">Kimasai / Maa (Indigenous Only)</option>
                <option value="english">English (National Press)</option>
              </select>
            </div>
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 2px;">Auto-Retry on Busy / No Answer</label>
              <select class="form-select" style="font-size: 0.78rem;">
                <option value="retry2">Auto-Retry on Busy: 2 Times (Safaricom SIP)</option>
                <option value="retry1">Auto-Retry on Busy: 1 Time</option>
                <option value="noretry">No Retry</option>
              </select>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.6rem; margin-top: 0.6rem; background: var(--color-surface); padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
            <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-muted);">SIP Audio Waveform:</span>
            <div class="waveform-container" id="audioWaveformVisualizer">
              <div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div>
              <div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div>
              <div class="waveform-bar"></div><div class="waveform-bar"></div>
            </div>
            <span style="font-size: 0.7rem; color: var(--text-muted); font-family: var(--font-mono); margin-left: auto;">G.711 / Opus Codec</span>
          </div>
        </div>
      `;
    } else if (channel === 'email') {
      specificOptions.style.display = 'block';
      specificOptions.innerHTML = `
        <div style="background: var(--bg-input); border: 1.5px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.85rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem;">
            <label style="font-size: 0.76rem; font-weight: 800; color: #2563eb; text-transform: uppercase; margin-bottom: 0; display: flex; align-items: center; gap: 0.4rem;">
              <span>✉️</span> Email Subject Line & Manifesto HTML
            </label>
            <span class="badge badge-green" style="font-size: 0.66rem;">SPF/DKIM Signed</span>
          </div>
          <input type="text" id="emailSubjectInput" class="form-control" style="font-size: 0.82rem; padding: 0.45rem 0.75rem;" value="${cfg.defaultSubject || 'Taarifa Rasmi kwa Watu wa Narok: Mwongozo wa Maendeleo 2027'}" oninput="updateCampaignPreview()">
        </div>
      `;
    } else if (channel === 'social') {
      specificOptions.style.display = 'block';
      specificOptions.innerHTML = `
        <div style="background: var(--bg-input); border: 1.5px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.85rem;">
          <div style="font-size: 0.76rem; font-weight: 800; color: #7c3aed; margin-bottom: 0.45rem; text-transform: uppercase; display: flex; align-items: center; gap: 0.4rem;">
            <span>📢</span> Sponsored Ad Headline & Audience Targeting
          </div>
          <div style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 0.6rem;">
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 2px;">Ad Headline</label>
              <input type="text" id="socialHeadlineInput" class="form-control" style="font-size: 0.82rem; padding: 0.4rem 0.65rem;" value="${cfg.defaultHeadline || 'Narok 2027: Mkutano wa Kihistoria Viwanja vya Kilgoris Alhamisi'}" oninput="updateCampaignPreview()">
            </div>
            <div>
              <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 2px;">Call to Action (CTA)</label>
              <select id="socialCtaSelect" class="form-select" style="font-size: 0.82rem; padding: 0.4rem 0.65rem;" onchange="updateCampaignPreview()">
                <option value="Learn More">Learn More / Hudhuria</option>
                <option value="Sign Up">Sign Up / Jiunge Nasi</option>
                <option value="Send Message">Send WhatsApp Message</option>
              </select>
            </div>
          </div>
        </div>
      `;
    } else {
      specificOptions.style.display = 'none';
      specificOptions.innerHTML = '';
    }
  }

  updateCampaignPreview();
  window.showToast(`Switched to ${cfg.name} (${cfg.subtitle})`, 'info');
}

async function loadSendersForCampaign(preferredSenderName) {
  try {
    const res = await fetch('/api/sender-ids');
    const json = await res.json();
    if (json.success) {
      window.state.senderIds = json.data;
      const select = document.getElementById('campaignSenderSelect');
      if (!select) return;

      let html = json.data.map(s => {
        const carrier = s.carrier_route || s.network_provider || 'Safaricom Direct Route';
        const isSaf = carrier.toLowerCase().includes('safaricom');
        const isAirtel = carrier.toLowerCase().includes('airtel');
        const isDual = carrier.toLowerCase().includes('dual');
        const prefix = isSaf ? '🟢' : (isAirtel ? '🔴' : (isDual ? '🟡' : '📶'));
        return `<option value="${s.sender_name}">${prefix} ${s.sender_name} — ${carrier} (${s.candidate_or_party})</option>`;
      }).join('');

      // Add prominent quick-add action inside the dropdown itself
      html += `<option value="__ADD_NEW_SENDER__" style="color: var(--color-gold); font-weight: 800; background: var(--color-forest-tint);">➕ + Register New Sender ID (Safaricom / Airtel SIM)...</option>`;
      select.innerHTML = html;

      if (preferredSenderName && json.data.some(s => s.sender_name === preferredSenderName)) {
        select.value = preferredSenderName;
        window.state.selectedSenderId = preferredSenderName;
      } else if (json.data.length > 0) {
        if (!window.state.selectedSenderId || !json.data.some(s => s.sender_name === window.state.selectedSenderId)) {
          window.state.selectedSenderId = json.data[0].sender_name;
        }
        select.value = window.state.selectedSenderId;
      }
      updateCampaignPreview();
    }
  } catch (err) {
    console.error('Error loading sender IDs for campaign:', err);
  }
}

function updateCampaignPreview() {
  const msgInput = document.getElementById('campaignMessageInput');
  const bubble = document.getElementById('phonePreviewBubble');
  const phoneSenderId = document.getElementById('phonePreviewSenderId');
  const phoneChannelSub = document.getElementById('phonePreviewChannelSub');
  const charCountEl = document.getElementById('charCount');

  // Inspector elements
  const inspectorBadge = document.getElementById('inspectorChannelBadge');
  const inspectorIcon = document.getElementById('inspectorChannelIcon');
  const inspectorName = document.getElementById('inspectorChannelName');
  const inspectorRoute = document.getElementById('inspectorRouteName');
  const telGateway = document.getElementById('telemetryGatewayName');
  const telRate = document.getElementById('telemetryDeliveryRate');
  const senderBadgeIcon = document.getElementById('inspectorSenderBadgeIcon');

  const text = msgInput ? msgInput.value : '';
  const channel = window.state.selectedChannel || 'sms';
  const cfg = CHANNEL_CONFIGS[channel] || CHANNEL_CONFIGS.sms;
  
  // Find active sender object
  const currentSenderName = window.state.selectedSenderId || cfg.defaultSender;
  const activeSenderObj = (window.state.senderIds || []).find(s => s.sender_name === currentSenderName);
  const activeRoute = activeSenderObj?.carrier_route || activeSenderObj?.network_provider || cfg.routeName;

  // Sample recipient data for real-time preview
  const wardSelect = document.getElementById('campaignWardSelect');
  const targetWard = (wardSelect && wardSelect.value !== 'all') ? wardSelect.value : 'Kilgoris Central';
  const sampleVoterName = 'Lemayian';
  const samplePolling = `${targetWard} Primary Station`;

  const previewText = text
    .replace(/\{first_name\}/g, sampleVoterName)
    .replace(/\{last_name\}/g, 'Ole Naserian')
    .replace(/\{ward\}/g, targetWard)
    .replace(/\{polling_station\}/g, samplePolling);

  // Update inspector header and telemetry
  if (inspectorBadge) {
    inspectorBadge.className = `inspector-channel-badge ${cfg.badgeClass}`;
  }
  if (inspectorIcon) inspectorIcon.textContent = cfg.icon;
  if (inspectorName) inspectorName.textContent = cfg.name.toUpperCase();
  if (inspectorRoute) inspectorRoute.textContent = channel === 'sms' ? activeRoute : cfg.routeName;
  if (telGateway) {
    if (channel === 'sms') {
      telGateway.textContent = activeRoute.includes('Airtel') ? 'Airtel GSM SIM Gateway' : (activeRoute.includes('Dual') ? 'Dual SIM Hybrid (Safaricom+Airtel)' : 'Safaricom Direct SMPP');
    } else {
      telGateway.textContent = cfg.gatewayName;
    }
  }
  if (telRate) telRate.textContent = cfg.deliveryRate;
  if (senderBadgeIcon) senderBadgeIcon.textContent = cfg.icon;

  if (bubble) {
    if (channel === 'whatsapp') {
      const btn1 = document.getElementById('waBtn1Text')?.value || '✅ Nitahudhuria (RSVP)';
      const btn2 = document.getElementById('waBtn2Text')?.value || '📄 Pakua Manifesto';
      bubble.innerHTML = `
        <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 0.6rem 0.8rem; border-radius: 6px; margin-bottom: 0.75rem; font-size: 0.82rem; color: #065f46; font-weight: 800; display: flex; align-items: center; justify-content: space-between;">
          <span>🟢 Meta Verified Official Business</span>
          <span style="font-size: 0.72rem; color: #059669; font-family: var(--font-mono);">254700000254</span>
        </div>
        <div style="line-height: 1.6; white-space: pre-wrap;">${previewText || '<span style="color: var(--text-muted)">Type your WhatsApp campaign message...</span>'}</div>
        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 0.3rem; margin-top: 0.4rem; font-size: 0.7rem; color: #059669;">
          <span>10:32 AM</span>
          <span style="color: #2563eb; font-weight: 800;">✓✓</span>
        </div>
        <div style="margin-top: 0.85rem; display: flex; flex-direction: column; gap: 0.45rem;">
          <button type="button" class="btn btn-outline" style="width: 100%; justify-content: center; background: #ffffff; border-color: #10b981; color: #059669; font-weight: 800; font-size: 0.82rem; padding: 0.45rem;">
            ${btn1}
          </button>
          <button type="button" class="btn btn-outline" style="width: 100%; justify-content: center; background: #ffffff; border-color: #10b981; color: #059669; font-weight: 800; font-size: 0.82rem; padding: 0.45rem;">
            ${btn2}
          </button>
        </div>
      `;
    } else if (channel === 'voice') {
      const langSelect = document.getElementById('voiceLanguageSelect');
      const langText = langSelect ? langSelect.options[langSelect.selectedIndex].text : 'Kiswahili Sanifu & Maa';
      bubble.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.85rem; padding: 0.75rem; background: var(--color-surface); border-radius: 8px; margin-bottom: 0.75rem; border: 1.5px solid var(--color-gold);">
          <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--color-gold); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; color: #000;">
            🎙️
          </div>
          <div style="flex: 1;">
            <div style="font-weight: 800; font-size: 0.9rem; color: var(--text-primary);">Incoming Voice IVR Call (SIP Audio)</div>
            <div style="font-size: 0.73rem; color: var(--text-muted);">${langText} • Automated Campaign Line</div>
          </div>
          <span class="pulse-dot" style="background: #10b981;"></span>
        </div>
        <div style="background: rgba(0,0,0,0.06); padding: 0.75rem; border-radius: 6px; font-style: italic; color: var(--text-primary); line-height: 1.6; border-left: 3px solid var(--color-gold);">
          "${previewText || 'Type your voice broadcast script in Swahili & Maa...'}"
        </div>
        <div style="display: flex; justify-content: space-around; align-items: center; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border-subtle);">
          <div style="display: flex; align-items: center; gap: 0.35rem; color: #10b981; font-weight: 700; font-size: 0.76rem;">
            <span>🟢</span> 1: Confirmed Attendance
          </div>
          <div style="display: flex; align-items: center; gap: 0.35rem; color: var(--color-gold); font-weight: 700; font-size: 0.76rem;">
            <span>🟡</span> 2: SMS Manifesto Link
          </div>
        </div>
      `;
    } else if (channel === 'email') {
      const subject = document.getElementById('emailSubjectInput')?.value || 'Taarifa Rasmi: Mwongozo wa Maendeleo 2027';
      bubble.innerHTML = `
        <div style="border-bottom: 1.5px solid var(--border-subtle); padding-bottom: 0.65rem; margin-bottom: 0.75rem;">
          <div style="font-weight: 800; font-size: 0.96rem; color: var(--text-primary); line-height: 1.3;">${subject}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.35rem; font-size: 0.72rem; color: var(--text-muted);">
            <span>From: <strong>Hon. Ledirama Campaign Secretariat</strong> &lt;info@naroktalksasa.ke&gt;</span>
            <span class="badge badge-green" style="font-size: 0.65rem;">TLS Encrypted</span>
          </div>
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">
            To: ${sampleVoterName} Ole Naserian (${targetWard})
          </div>
        </div>
        <div style="line-height: 1.65; color: var(--text-primary); white-space: pre-wrap;">
          ${previewText || '<span style="color: var(--text-muted)">Type your email newsletter body...</span>'}
        </div>
      `;
    } else if (channel === 'social') {
      const headline = document.getElementById('socialHeadlineInput')?.value || 'Narok 2027: Mkutano wa Kihistoria Viwanja vya Kilgoris';
      const cta = document.getElementById('socialCtaSelect')?.value || 'Learn More';
      bubble.innerHTML = `
        <div style="background: var(--color-surface); border: 1.5px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.85rem; box-shadow: var(--shadow-sm);">
          <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.6rem;">
            <div style="width: 38px; height: 38px; border-radius: 50%; background: var(--color-forest); color: var(--color-gold); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem;">
              TS
            </div>
            <div>
              <div style="font-weight: 800; font-size: 0.88rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.3rem;">
                <span>Narok County Coalition 2027</span>
                <span style="color: #1da1f2; font-size: 0.85rem;">✓</span>
              </div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">Sponsored • Targeted to ${targetWard} Voters</div>
            </div>
          </div>
          <div style="font-size: 0.88rem; line-height: 1.55; color: var(--text-primary); margin-bottom: 0.75rem; white-space: pre-wrap;">${previewText || '<span style="color: var(--text-muted)">Type your sponsored social ad copy...</span>'}</div>
          <div style="background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 0.65rem; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 800; font-size: 0.82rem; color: var(--text-primary); max-width: 65%;">${headline}</div>
            <button type="button" class="btn btn-pill-forest btn-sm" style="font-size: 0.74rem; padding: 0.35rem 0.75rem;">
              ${cta} ➔
            </button>
          </div>
        </div>
      `;
    } else {
      bubble.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: var(--text-muted); margin-bottom: 0.5rem; padding-bottom: 0.4rem; border-bottom: 1px solid var(--border-subtle);">
          <span>Route: <strong style="color: var(--color-forest);">${activeRoute}</strong></span>
          <span>DLR: Instant (&lt; 2.4s)</span>
        </div>
        <div style="white-space: pre-wrap; font-size: 0.94rem; line-height: 1.6;">${previewText || '<span style="color: var(--text-muted)">Type your SMS broadcast message on the left...</span>'}</div>
      `;
    }
  }

  if (phoneSenderId) {
    phoneSenderId.textContent = channel === 'sms' ? currentSenderName : cfg.defaultSender;
  }

  if (phoneChannelSub) {
    if (channel === 'sms' && activeSenderObj) {
      phoneChannelSub.textContent = `${activeSenderObj.carrier_route || 'Safaricom SMPP'} • ${activeSenderObj.sim_slot || 'Active SIM'}`;
    } else {
      phoneChannelSub.textContent = cfg.senderSub;
    }
  }

  // Update Char Count & Cost
  const len = text.length;
  if (channel === 'sms') {
    const numSms = len <= 160 ? 1 : Math.ceil(len / 153);
    if (charCountEl) {
      charCountEl.textContent = `${len} / 160 (${numSms} SMS part${numSms > 1 ? 's' : ''})`;
    }
  } else {
    if (charCountEl) {
      charCountEl.textContent = `${len} characters`;
    }
  }

  recalculateRecipientsAndCost();
}

async function recalculateRecipientsAndCost() {
  const wardSelect = document.getElementById('campaignWardSelect');
  const targetWard = wardSelect ? wardSelect.value : 'all';
  const targetCountEl = document.getElementById('campaignTargetVoters');
  const estCostEl = document.getElementById('campaignEstCostKes');
  const msgInput = document.getElementById('campaignMessageInput');

  const text = msgInput ? msgInput.value : '';
  const channel = window.state.selectedChannel || 'sms';
  const cfg = CHANNEL_CONFIGS[channel] || CHANNEL_CONFIGS.sms;
  const numSms = text.length <= 160 ? 1 : Math.ceil(text.length / 153);

  try {
    const params = new URLSearchParams();
    if (targetWard && targetWard !== 'all') params.append('ward', targetWard);
    params.append('is_opted_out', 'false');

    const res = await fetch(`/api/constituents?${params.toString()}`);
    const json = await res.json();
    if (json.success) {
      const recipientCount = json.total || 0;
      if (targetCountEl) {
        targetCountEl.textContent = recipientCount.toLocaleString();
      }

      let totalCost = 0;
      if (channel === 'sms') {
        totalCost = recipientCount * cfg.costPerUnit * numSms;
      } else {
        totalCost = recipientCount * cfg.costPerUnit;
      }

      if (estCostEl) {
        estCostEl.textContent = `KES ${totalCost.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    }
  } catch (err) {
    console.error('Error calculating recipients:', err);
  }
}

async function handleSendCampaign(isImmediate) {
  const nameInput = document.getElementById('campaignNameInput');
  const senderSelect = document.getElementById('campaignSenderSelect');
  const wardSelect = document.getElementById('campaignWardSelect');
  const msgInput = document.getElementById('campaignMessageInput');
  const socialSyncCheck = document.getElementById('campaignSocialSyncCheck');

  const title = nameInput ? nameInput.value.trim() : '';
  const senderId = senderSelect ? senderSelect.value : 'NAROK_TALK';
  const targetWard = wardSelect ? wardSelect.value : 'all';
  const messageBody = msgInput ? msgInput.value.trim() : '';
  const socialSync = socialSyncCheck ? socialSyncCheck.checked : true;
  const channel = window.state.selectedChannel || 'sms';

  if (!title || !messageBody) {
    window.showToast('Please provide a campaign title and message content.', 'error');
    return;
  }

  try {
    window.showToast(isImmediate ? 'Broadcasting campaign across Safaricom/Airtel gateways...' : 'Scheduling campaign...', 'info');

    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_name: title,
        channel,
        sender_id: senderId,
        message_body: messageBody,
        target_ward: targetWard === 'all' ? null : targetWard,
        status: isImmediate ? 'completed' : 'scheduled',
        social_sync_enabled: socialSync
      })
    });

    const json = await res.json();
    if (json.success) {
      window.showToast(
        isImmediate
          ? `Broadcast "${title}" dispatched successfully!`
          : `Campaign "${title}" scheduled!`,
        'success'
      );

      if (window.loadOverviewCampaigns) window.loadOverviewCampaigns();
      if (window.fetchStats) window.fetchStats();
      if (window.loadSocialSync) window.loadSocialSync();
    } else {
      window.showToast(json.error || 'Failed to dispatch campaign', 'error');
    }
  } catch (err) {
    window.showToast('Network error while launching campaign', 'error');
  }
}

// ========================================================
// BROADCAST SHARING & MULTI-CHANNEL DISTRIBUTION
// ========================================================
function openShareBroadcastModal() {
  const msgInput = document.getElementById('campaignMessageInput');
  const nameInput = document.getElementById('campaignNameInput');
  const wardSelect = document.getElementById('campaignWardSelect');
  const channel = window.state.selectedChannel || 'sms';
  const cfg = CHANNEL_CONFIGS[channel] || CHANNEL_CONFIGS.sms;

  const targetWard = (wardSelect && wardSelect.value !== 'all') ? wardSelect.value : 'Kilgoris Central';
  const rawText = msgInput ? msgInput.value : '';
  const title = nameInput ? nameInput.value : 'Narok 2027 Voter Outreach';

  // Substitute tags with representative sample constituent
  const formattedText = rawText
    .replace(/\{first_name\}/g, 'Lemayian')
    .replace(/\{last_name\}/g, 'Ole Naserian')
    .replace(/\{ward\}/g, targetWard)
    .replace(/\{polling_station\}/g, `${targetWard} Primary Station`);

  const previewSnippet = document.getElementById('sharePreviewContent');
  if (previewSnippet) {
    previewSnippet.textContent = formattedText;
  }

  const subtitle = document.getElementById('shareModalChannelSubtitle');
  if (subtitle) {
    subtitle.textContent = `${cfg.icon} ${cfg.name} • ${cfg.subtitle} • Ready for Distribution`;
  }

  // Store for sharing handlers
  window._currentShareDraft = {
    title,
    text: formattedText,
    channel,
    ward: targetWard
  };

  window.openModal('modalShareBroadcast');
}

function initShareModalListeners() {
  // 1. Copy Text Button
  const btnCopy = document.getElementById('btnCopyShareText');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      const text = window._currentShareDraft?.text || document.getElementById('sharePreviewContent')?.textContent || '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        window.showToast('Broadcast text copied to clipboard! Ready to paste into groups.', 'success');
      }).catch(() => {
        window.showToast('Unable to copy to clipboard', 'error');
      });
    });
  }

  // 2. WhatsApp Share
  const btnWhatsApp = document.getElementById('btnShareWhatsApp');
  if (btnWhatsApp) {
    btnWhatsApp.addEventListener('click', () => {
      const text = window._currentShareDraft?.text || '';
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
      window.showToast('Opening WhatsApp with campaign message pre-filled...', 'info');
    });
  }

  // 3. Twitter / X Share
  const btnTwitter = document.getElementById('btnShareTwitter');
  if (btnTwitter) {
    btnTwitter.addEventListener('click', () => {
      const text = window._currentShareDraft?.text || '';
      const tweetText = text.length > 250 ? text.substring(0, 245) + '... #NarokTalkSasa' : text;
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
      window.open(url, '_blank');
      window.showToast('Opening X (Twitter) post composer...', 'info');
    });
  }

  // 4. Mobile SMS Share
  const btnSms = document.getElementById('btnShareSms');
  if (btnSms) {
    btnSms.addEventListener('click', () => {
      const text = window._currentShareDraft?.text || '';
      window.location.href = `sms:?body=${encodeURIComponent(text)}`;
      window.showToast('Opening mobile phone SMS app...', 'info');
    });
  }

  // 5. Email Dispatch Share
  const btnEmail = document.getElementById('btnShareEmail');
  if (btnEmail) {
    btnEmail.addEventListener('click', () => {
      const draft = window._currentShareDraft;
      const subject = document.getElementById('emailSubjectInput')?.value || draft?.title || 'Narok County Voter Outreach Update';
      const body = draft?.text || '';
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.showToast('Opening default email application...', 'info');
    });
  }

  // 6. Native Device Share API (Android / Supported Desktop)
  const btnNative = document.getElementById('btnNativeDeviceShare');
  if (btnNative) {
    btnNative.addEventListener('click', async () => {
      const draft = window._currentShareDraft;
      const text = draft?.text || '';
      const title = draft?.title || 'Talk Sasa Campaign Broadcast';

      if (navigator.share) {
        try {
          await navigator.share({
            title: title,
            text: text,
            url: window.location.href
          });
          window.showToast('Shared successfully via system share!', 'success');
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.log('Native share error or dismissed:', err);
          }
        }
      } else {
        // Fallback: Copy to clipboard
        navigator.clipboard.writeText(text).then(() => {
          window.showToast('Native share unavailable on this device. Broadcast copied to clipboard!', 'info');
        });
      }
    });
  }
}

// ========================================================
// VOICE IVR AUDIO DEMO SIMULATOR
// ========================================================
function toggleVoiceAudioPlayback() {
  const waveform = document.getElementById('audioWaveformVisualizer');
  const playIcon = document.getElementById('voicePlayIcon');
  const playText = document.getElementById('voicePlayText');
  const msgInput = document.getElementById('campaignMessageInput');

  if (isVoicePlaying) {
    // Stop playing
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isVoicePlaying = false;
    if (waveform) waveform.classList.remove('playing');
    if (playIcon) playIcon.textContent = '▶️';
    if (playText) playText.textContent = 'Listen Spoken Demo';
    window.showToast('Voice audio simulation stopped.', 'info');
  } else {
    // Start playing
    isVoicePlaying = true;
    if (waveform) waveform.classList.add('playing');
    if (playIcon) playIcon.textContent = '⏹️';
    if (playText) playText.textContent = 'Stop Audio Demo';

    const textToSpeak = msgInput?.value?.replace(/\{first_name\}/g, 'Lemayian').replace(/\{ward\}/g, 'Kilgoris Central') || 'Habari mwananchi wa Narok.';

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      voiceSynthesisUtterance = new SpeechSynthesisUtterance(textToSpeak);
      voiceSynthesisUtterance.rate = 0.95; // Steady spoken voice rate
      voiceSynthesisUtterance.pitch = 1.0;
      
      voiceSynthesisUtterance.onend = () => {
        isVoicePlaying = false;
        if (waveform) waveform.classList.remove('playing');
        if (playIcon) playIcon.textContent = '▶️';
        if (playText) playText.textContent = 'Listen Spoken Demo';
      };

      voiceSynthesisUtterance.onerror = () => {
        isVoicePlaying = false;
        if (waveform) waveform.classList.remove('playing');
        if (playIcon) playIcon.textContent = '▶️';
        if (playText) playText.textContent = 'Listen Spoken Demo';
      };

      window.speechSynthesis.speak(voiceSynthesisUtterance);
    } else {
      // Browser doesn't support Web Speech API, run visualizer timer for 5s
      setTimeout(() => {
        isVoicePlaying = false;
        if (waveform) waveform.classList.remove('playing');
        if (playIcon) playIcon.textContent = '▶️';
        if (playText) playText.textContent = 'Listen Spoken Demo';
      }, 5000);
    }

    window.showToast('Simulating live Voice IVR call stream...', 'success');
  }
}

window.initCampaignStudio = initCampaignStudio;
window.updateCampaignPreview = updateCampaignPreview;
window.recalculateRecipientsAndCost = recalculateRecipientsAndCost;
window.handleChannelChange = handleChannelChange;
window.loadSendersForCampaign = loadSendersForCampaign;
window.openShareBroadcastModal = openShareBroadcastModal;
window.toggleVoiceAudioPlayback = toggleVoiceAudioPlayback;

// Auto-init when DOM is ready so channel buttons work immediately
document.addEventListener('DOMContentLoaded', function() {
  initCampaignStudio();
});
