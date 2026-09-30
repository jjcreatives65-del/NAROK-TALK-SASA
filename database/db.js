const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'data.json');

// Subcounties and Wards of Narok County
const NAROK_WARDS = {
  'Kilgoris': ['Kilgoris Central', 'Keyian', 'Angata Barikoi', 'Shankoe', 'Kimintet', 'Lolgorian'],
  'Narok North': ['Olposimoru', 'Olokurto', 'Narok Town', 'Nkware', 'Melili', 'Olorropil'],
  'Narok South': ['Maji Moto/Naroosura', 'Ololulung\'a', 'Melelo', 'Loita', 'Sogoo', 'Sagamian'],
  'Narok East': ['Mosiro', 'Ildamat', 'Keekonyokie', 'Suswa'],
  'Narok West': ['Ilmotiok', 'Mara', 'Siana', 'Naikarra'],
  'Emurua Dikirr': ['Ilkerin', 'Ololmasani', 'Mogondo', 'Kapsasian']
};

const ALL_WARDS = Object.values(NAROK_WARDS).flat();

function generateUuid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id_' + Math.random().toString(36).substr(2, 9);
}

// In-Memory Database store with index simulation
class Database {
  constructor() {
    this.constituents = [];
    this.campaigns = [];
    this.senderIds = [];
    this.rallies = [];
    this.socialSyncAds = [];
    this.dispatches = [];
    this.automations = [];
    
    // In-memory indexes
    this.idx_ward = new Map();
    this.idx_phone = new Map();
    this.idx_national_id = new Map();

    this.init();
  }

  init() {
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const data = JSON.parse(raw);
        this.constituents = data.constituents || [];
        this.campaigns = data.campaigns || [];
        this.senderIds = data.senderIds || [];
        this.rallies = data.rallies || [];
        this.socialSyncAds = data.socialSyncAds || [];
        this.dispatches = data.dispatches || [];
        this.automations = data.automations || [];
        this.rebuildIndexes();
        return;
      } catch (err) {
        console.error('Error loading data file, re-seeding:', err);
      }
    }
    this.seedDefaults();
    this.save();
  }

  save() {
    try {
      const data = {
        constituents: this.constituents,
        campaigns: this.campaigns,
        senderIds: this.senderIds,
        rallies: this.rallies,
        socialSyncAds: this.socialSyncAds,
        dispatches: this.dispatches,
        automations: this.automations
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save data.json:', err);
    }
  }

  rebuildIndexes() {
    this.idx_ward.clear();
    this.idx_phone.clear();
    this.idx_national_id.clear();

    for (const c of this.constituents) {
      // Index by Ward
      const wardKey = (c.ward || 'Unknown').trim().toLowerCase();
      if (!this.idx_ward.has(wardKey)) {
        this.idx_ward.set(wardKey, new Set());
      }
      this.idx_ward.get(wardKey).add(c.id);

      // Index by Phone
      if (c.phone_number) {
        this.idx_phone.set(c.phone_number.trim(), c);
      }

      // Index by National ID
      if (c.national_id) {
        this.idx_national_id.set(c.national_id.trim(), c);
      }
    }
  }

  seedDefaults() {
    // Seed approved Sender IDs with Safaricom and Airtel SIM Card integration
    this.senderIds = [
      {
        id: generateUuid(),
        sender_name: 'NAROK_TALK',
        candidate_or_party: 'Narok United Coalition 2027',
        category: 'Official Party Sender ID',
        status: 'approved',
        network_provider: 'Safaricom Direct SMPP & Corporate SIM',
        carrier_route: 'Safaricom Direct SMPP (Corporate SIM)',
        sim_slot: 'Slot 1: Safaricom Corporate GSM',
        sim_number: '+254722000254',
        throughput: '500 SMS/sec (Safaricom SMPP)',
        cak_reference: 'CAK/SMS/2026/0112',
        created_at: new Date('2026-01-10T08:00:00Z').toISOString()
      },
      {
        id: generateUuid(),
        sender_name: 'LEDIRAMA27',
        candidate_or_party: 'Hon. Ledirama Ole Senteu (Candidate)',
        category: 'Candidate Direct Outreach',
        status: 'approved',
        network_provider: 'Airtel Kenya SIM Card Gateway',
        carrier_route: 'Airtel Kenya GSM SIM Gateway',
        sim_slot: 'Slot 2: Airtel 4G LTE SIM Box',
        sim_number: '+254733000254',
        throughput: '350 SMS/sec (Airtel Kenya SMPP)',
        cak_reference: 'CAK/SMS/2026/0248',
        created_at: new Date('2026-02-14T09:30:00Z').toISOString()
      },
      {
        id: generateUuid(),
        sender_name: 'MAA_VOICE',
        candidate_or_party: 'Maa Grassroots Alliance & Youth Front',
        category: 'Civic Mobilization',
        status: 'approved',
        network_provider: 'Dual SIM Safaricom + Airtel Failover',
        carrier_route: 'Dual SIM Gateway (Safaricom / Airtel Auto-Switch)',
        sim_slot: 'Dual SIM Pool (Safaricom + Airtel)',
        sim_number: '+254720999000 / +254750999000',
        throughput: '1,000 SMS/sec (Dual SIM Burst)',
        cak_reference: 'CAK/SMS/2026/0394',
        created_at: new Date('2026-03-01T11:00:00Z').toISOString()
      },
      {
        id: generateUuid(),
        sender_name: 'NAROK_YOUTH',
        candidate_or_party: 'Narok County Youth Movement',
        category: 'Youth & Boda Boda League',
        status: 'approved',
        network_provider: 'Safaricom SIM Modem Gateway',
        carrier_route: 'Safaricom Direct SMPP',
        sim_slot: 'Slot 1: Safaricom SIM (+254712888999)',
        sim_number: '+254712888999',
        throughput: '250 SMS/sec (Safaricom Gateway)',
        cak_reference: 'CAK/SMS/2026/0517',
        created_at: new Date('2026-09-20T14:15:00Z').toISOString()
      }
    ];

    // Seed realistic Constituents across Narok County
    const sampleVoters = [
      { first: 'Lemayian', last: 'Ole Naserian', phone: '+254712345001', id: '28491024', ward: 'Kilgoris Central', county: 'Narok', polling: 'Kilgoris Primary School', opt: false, status: 'elder', channel: 'sms', tags: ['elder_council', 'community_opinion_leader'] },
      { first: 'Sintamei', last: 'Resiato', phone: '+254722987110', id: '34190822', ward: 'Kilgoris Central', county: 'Narok', polling: 'St. Joseph Technical', opt: false, status: 'youth_first_time', channel: 'whatsapp', tags: ['youth_mobilizer', 'digital_volunteer'] },
      { first: 'Kiprotich', last: 'Koech', phone: '+254701239841', id: '29881723', ward: 'Keyian', county: 'Narok', polling: 'Enoosaen Secondary', opt: false, status: 'registered', channel: 'sms', tags: ['farmer_coop_member'] },
      { first: 'Naisula', last: 'Sanau', phone: '+254715887234', id: '31092841', ward: 'Angata Barikoi', county: 'Narok', polling: 'Angata Barikoi Dispensary', opt: false, status: 'registered', channel: 'sms', tags: ['women_rep_delegate'] },
      { first: 'Ole', last: 'Kapunkei', phone: '+254790112233', id: '22119045', ward: 'Shankoe', county: 'Narok', polling: 'Shankoe Primary', opt: false, status: 'elder', channel: 'voice', tags: ['clan_chairperson'] },
      { first: 'Faith', last: 'Chebet', phone: '+254728345671', id: '36019284', ward: 'Kimintet', county: 'Narok', polling: 'Kimintet Social Hall', opt: false, status: 'youth_first_time', channel: 'whatsapp', tags: ['campus_student'] },
      { first: 'Moitalel', last: 'Ole Ntutu', phone: '+254711445566', id: '25489012', ward: 'Narok Town', county: 'Narok', polling: 'Narok High School Hall', opt: false, status: 'registered', channel: 'sms', tags: ['boda_boda_chairman'] },
      { first: 'Mercy', last: 'Wanjiku', phone: '+254720998877', id: '30987112', ward: 'Narok Town', county: 'Narok', polling: 'Maasai Mara University Center', opt: false, status: 'registered', channel: 'whatsapp', tags: ['business_community', 'traders_assoc'] },
      { first: 'Moses', last: 'Senteu', phone: '+254733445588', id: '35198274', ward: 'Narok Town', county: 'Narok', polling: 'St. Mary\'s Catholic Hall', opt: false, status: 'youth_first_time', channel: 'sms', tags: ['youth_rep'] },
      { first: 'Peris', last: 'Naipanoi', phone: '+254718334422', id: '27651093', ward: 'Olposimoru', county: 'Narok', polling: 'Olposimoru Primary', opt: false, status: 'registered', channel: 'sms', tags: ['tea_farmers_union'] },
      { first: 'Daniel', last: 'Ole Kaelo', phone: '+254707119933', id: '23891045', ward: 'Olokurto', county: 'Narok', polling: 'Olokurto Chief Camp', opt: false, status: 'elder', channel: 'voice', tags: ['peace_committee'] },
      { first: 'Dennis', last: 'Kiprono', phone: '+254792348712', id: '33918274', ward: 'Nkware', county: 'Narok', polling: 'Nkware Primary School', opt: true, status: 'registered', channel: 'sms', tags: ['opted_out_voter'] },
      { first: 'Sylvia', last: 'Naisenya', phone: '+254719882211', id: '32091834', ward: 'Melili', county: 'Narok', polling: 'Melili Day Secondary', opt: false, status: 'registered', channel: 'whatsapp', tags: ['community_health_promoter'] },
      { first: 'Solomon', last: 'Ole Tiampati', phone: '+254714556677', id: '26781923', ward: 'Suswa', county: 'Narok', polling: 'Suswa Junction Hall', opt: false, status: 'registered', channel: 'sms', tags: ['pastoralist_caucus'] },
      { first: 'Jackline', last: 'Nashipae', phone: '+254721443322', id: '34891029', ward: 'Suswa', county: 'Narok', polling: 'Suswa Primary', opt: false, status: 'youth_first_time', channel: 'whatsapp', tags: ['geothermal_worker_union'] },
      { first: 'Brian', last: 'Kipkemoi', phone: '+254724991188', id: '37192834', ward: 'Ildamat', county: 'Narok', polling: 'Ildamat Center', opt: false, status: 'youth_first_time', channel: 'sms', tags: ['digital_volunteer'] },
      { first: 'Leshan', last: 'Ole Gilisho', phone: '+254705123987', id: '21908234', ward: 'Mosiro', county: 'Narok', polling: 'Mosiro Dispensary Grounds', opt: false, status: 'elder', channel: 'voice', tags: ['elder_council'] },
      { first: 'Eunice', last: 'Chepkirui', phone: '+254726778899', id: '33491028', ward: 'Ololmasani', county: 'Narok', polling: 'Dikirr Township Primary', opt: false, status: 'registered', channel: 'sms', tags: ['women_chama_lead'] },
      { first: 'Philip', last: 'Ole Yiamoi', phone: '+254713998822', id: '24908172', ward: 'Ilmotiok', county: 'Narok', polling: 'Ilmotiok Secondary', opt: false, status: 'registered', channel: 'sms', tags: ['livestock_association'] },
      { first: 'Jane', last: 'Nolari', phone: '+254716223344', id: '31892019', ward: 'Mara', county: 'Narok', polling: 'Talek Gate Center', opt: false, status: 'registered', channel: 'whatsapp', tags: ['tourism_conservancy_staff'] },
      { first: 'Kipkorir', last: 'Bett', phone: '+254799887766', id: '35890123', ward: 'Mogondo', county: 'Narok', polling: 'Mogondo Primary', opt: false, status: 'youth_first_time', channel: 'sms', tags: ['youth_mobilizer'] },
      { first: 'Gladys', last: 'Senewa', phone: '+254723001122', id: '29102938', ward: 'Siana', county: 'Narok', polling: 'Siana Conservancy Hall', opt: false, status: 'registered', channel: 'sms', tags: ['women_network'] },
      { first: 'Kiprono', last: 'Langat', phone: '+254727123999', id: '32901928', ward: 'Ololulung\'a', county: 'Narok', polling: 'Ololulung\'a Sub-District Hospital', opt: false, status: 'registered', channel: 'sms', tags: ['wheat_farmers_union'] },
      { first: 'Naeku', last: 'Tinkoi', phone: '+254717654321', id: '34567812', ward: 'Maji Moto/Naroosura', county: 'Narok', polling: 'Naroosura Market Grounds', opt: false, status: 'registered', channel: 'whatsapp', tags: ['market_trader'] },
      { first: 'Richard', last: 'Ole Meeli', phone: '+254708776655', id: '28192039', ward: 'Keekonyokie', county: 'Narok', polling: 'Keekonyokie Primary', opt: false, status: 'registered', channel: 'sms', tags: ['field_marshal'] }
    ];

    this.constituents = sampleVoters.map(v => ({
      id: generateUuid(),
      phone_number: v.phone,
      first_name: v.first,
      last_name: v.last,
      national_id: v.id,
      county: v.county,
      ward: v.ward,
      polling_station: v.polling,
      is_opted_out: v.opt,
      voter_status: v.status,
      preferred_channel: v.channel,
      tags: v.tags,
      created_at: new Date(Date.now() - Math.floor(Math.random() * 60) * 86400000).toISOString()
    }));

    // Seed Rallies
    this.rallies = [
      {
        id: generateUuid(),
        rally_title: 'Kilgoris Mega Rally & Livestock Economic Manifesto',
        venue: 'Kilgoris Stadium Grounds',
        ward: 'Kilgoris Central',
        rally_date: new Date(Date.now() + 2 * 86400000).toISOString(),
        chief_guest: 'Hon. Ledirama Ole Senteu & Narok Coalition Principals',
        expected_turnout: 15000,
        actual_rsvps: 4210,
        status: 'upcoming',
        image_url: 'assets/banner.jpg',
        created_at: new Date('2026-09-20T10:00:00Z').toISOString()
      },
      {
        id: generateUuid(),
        rally_title: 'Narok Town Youth & Boda Boda Empowerment Townhall',
        venue: 'Maasai Mara Cultural Hall, Narok Town',
        ward: 'Narok Town',
        rally_date: new Date(Date.now() + 5 * 86400000).toISOString(),
        chief_guest: 'Youth Senatorial Envoy & County Youth League',
        expected_turnout: 8500,
        actual_rsvps: 2890,
        status: 'upcoming',
        image_url: 'assets/banner.jpg',
        created_at: new Date('2026-09-22T14:30:00Z').toISOString()
      },
      {
        id: generateUuid(),
        rally_title: 'Suswa Pastoralist Water & Land Rights Summit',
        venue: 'Suswa Junction Grounds',
        ward: 'Suswa',
        rally_date: new Date(Date.now() - 3 * 86400000).toISOString(),
        chief_guest: 'Council of Maa Elders & Legal Advisory Team',
        expected_turnout: 6000,
        actual_rsvps: 5820,
        status: 'completed',
        image_url: 'assets/banner.jpg',
        created_at: new Date('2026-09-15T09:00:00Z').toISOString()
      }
    ];

    // Seed Past Campaigns
    this.campaigns = [
      {
        id: generateUuid(),
        campaign_name: 'Kilgoris Mega Rally Voter Mobilization Blitz',
        channel: 'sms',
        sender_id: 'LEDIRAMA27',
        message_body: 'Habari Ndg {first_name}, Kiongozi wetu Hon. Ledirama Ole Senteu atakua Kilgoris Stadium Alhamisi 10 AM. Tujumuike kwa pamoja kutetea maendeleo ya Narok! Kura Yako, Sauti Yako.',
        target_ward: 'Kilgoris Central',
        status: 'completed',
        scheduled_at: new Date('2026-09-25T08:00:00Z').toISOString(),
        total_recipients: 12450,
        successful_deliveries: 12210,
        failed_deliveries: 240,
        estimated_cost_kes: 9960.00,
        social_sync_enabled: true,
        created_at: new Date('2026-09-24T18:00:00Z').toISOString()
      },
      {
        id: generateUuid(),
        campaign_name: 'Narok Town Youth Innovation & Hustler Fund SMS',
        channel: 'multi',
        sender_id: 'NAROK_TALK',
        message_body: 'Sasa {first_name}! Je uko tayari kwa mabadiliko Narok? Ijumaa tunazindua Youth Tech & Agri Grants mjini Narok. Piga kura ya maendeleo! Usikose kujiunga.',
        target_ward: 'Narok Town',
        status: 'processing',
        scheduled_at: new Date().toISOString(),
        total_recipients: 8900,
        successful_deliveries: 7650,
        failed_deliveries: 50,
        estimated_cost_kes: 7120.00,
        social_sync_enabled: true,
        created_at: new Date('2026-09-27T08:00:00Z').toISOString()
      },
      {
        id: generateUuid(),
        campaign_name: 'County-Wide IEBC Voter Verification & Polling Station Reminder',
        channel: 'sms',
        sender_id: 'NAROK_TALK',
        message_body: 'Mwana Narok mwenzangu, thibitisha kituo chako cha kura kabla ya Ijumaa. Tuma nambari yako ya kitambulisho kwa 70000 au tembelea ofisi zetu za wadi.',
        target_ward: null, // All wards
        status: 'scheduled',
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        total_recipients: 420000,
        successful_deliveries: 0,
        failed_deliveries: 0,
        estimated_cost_kes: 336000.00,
        social_sync_enabled: true,
        created_at: new Date('2026-09-27T16:00:00Z').toISOString()
      }
    ];

    // Seed Social Media Sync Campaigns (Meta & X)
    this.socialSyncAds = [
      {
        id: generateUuid(),
        campaign_id: this.campaigns[0].id,
        platform: 'both',
        ad_headline: 'Kilgoris Mega Rally - Kura ya Ushindi na Maendeleo',
        ad_copy: 'Watu wa Kilgoris, time ya mabadiliko ya kweli ni sasa! Ungana na Hon. Ledirama Ole Senteu na maelfu ya wazalendo Alhamisi hii katika viwanja vya Kilgoris Stadium. #NarokTalkSasa #KilgorisDecides #VoteForChange',
        target_ward: 'Kilgoris Central',
        audience_hash_count: 12450,
        match_rate_percentage: 84.6,
        ad_status: 'active',
        created_at: new Date('2026-09-25T08:30:00Z').toISOString()
      },
      {
        id: generateUuid(),
        campaign_id: this.campaigns[1].id,
        platform: 'facebook',
        ad_headline: 'Narok Town Youth Revolution: Tech & Agri Grants',
        ad_copy: 'Vijana wa Narok Town! Hatubaki nyuma. Jiunge nasi mjini Narok Ijumaa 2 PM kupokea mwongozo wa County Innovation Fund. Pamoja tutasonga mbele!',
        target_ward: 'Narok Town',
        audience_hash_count: 8900,
        match_rate_percentage: 91.2,
        ad_status: 'synced',
        created_at: new Date('2026-09-27T08:15:00Z').toISOString()
      }
    ];

    // Seed Automated Messaging Flows
    this.automations = [
      {
        id: generateUuid(),
        flow_name: 'Voter Registration & Welcome Sequence',
        trigger_event: 'new_constituent_added',
        is_active: true,
        steps: [
          { type: 'delay', duration: 'Instant' },
          { type: 'sms', sender: 'NAROK_TALK', content: 'Habari {first_name}, asante kwa kujiunga na vuguvugu la Narok Talk Sasa katika wadi ya {ward}. Hapa utapata habari za kuaminika.' },
          { type: 'delay', duration: '2 Days' },
          { type: 'whatsapp', content: 'Habari tena {first_name}! Bonyeza hapa kusoma Manifesto yetu ya Elimu, Afya na Kilimo: https://naroktalksasa.ke/manifesto' }
        ],
        created_at: new Date('2026-02-01T00:00:00Z').toISOString()
      },
      {
        id: generateUuid(),
        flow_name: 'Political Rally 48-Hour Mobilization Blitz',
        trigger_event: 'rally_event_created',
        is_active: true,
        steps: [
          { type: 'condition', rule: 'target_ward_match' },
          { type: 'sms', sender: 'LEDIRAMA27', content: 'Rally Alert! Hon. Ledirama atakua {venue} tarehe {rally_date}. Jiandae na ujulishe majirani.' },
          { type: 'delay', duration: '24 Hours Before' },
          { type: 'voice_call', content: 'Simu ya mwaliko kutoka kwa timu ya kampeni kuelekea mkutano wa kesho.' }
        ],
        created_at: new Date('2026-03-10T00:00:00Z').toISOString()
      }
    ];

    this.rebuildIndexes();
  }

  // Constituents CRUD & Segmentation
  getConstituents({ ward, search, is_opted_out, voter_status, limit = 50, offset = 0 } = {}) {
    let result = [...this.constituents];

    // Index-accelerated filtering by ward
    if (ward && ward !== 'all') {
      const wardKey = ward.trim().toLowerCase();
      const matchedIds = this.idx_ward.get(wardKey) || new Set();
      result = result.filter(c => matchedIds.has(c.id));
    }

    // Opted out filter
    if (is_opted_out !== undefined && is_opted_out !== null && is_opted_out !== 'all') {
      const boolOpt = String(is_opted_out) === 'true';
      result = result.filter(c => c.is_opted_out === boolOpt);
    }

    // Voter status filter
    if (voter_status && voter_status !== 'all') {
      result = result.filter(c => c.voter_status === voter_status);
    }

    // Free text search (Name, Phone, National ID, Polling station)
    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      result = result.filter(c => 
        (c.first_name && c.first_name.toLowerCase().includes(q)) ||
        (c.last_name && c.last_name.toLowerCase().includes(q)) ||
        (c.phone_number && c.phone_number.includes(q)) ||
        (c.national_id && c.national_id.includes(q)) ||
        (c.ward && c.ward.toLowerCase().includes(q)) ||
        (c.polling_station && c.polling_station.toLowerCase().includes(q))
      );
    }

    const total = result.length;
    const paginated = result.slice(offset, offset + limit);

    return { total, constituents: paginated };
  }

  createConstituent(data) {
    // Check unique phone number
    if (data.phone_number && this.idx_phone.has(data.phone_number.trim())) {
      throw new Error(`Phone number ${data.phone_number} is already registered.`);
    }
    // Check unique national id
    if (data.national_id && this.idx_national_id.has(data.national_id.trim())) {
      throw new Error(`National ID ${data.national_id} is already in the voter database.`);
    }

    const newRecord = {
      id: generateUuid(),
      phone_number: data.phone_number.trim(),
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      national_id: data.national_id || '',
      county: data.county || 'Narok',
      ward: data.ward || 'Narok Town',
      polling_station: data.polling_station || 'County Primary School',
      is_opted_out: Boolean(data.is_opted_out),
      voter_status: data.voter_status || 'registered',
      preferred_channel: data.preferred_channel || 'sms',
      tags: Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : ['field_registration']),
      created_at: new Date().toISOString()
    };

    this.constituents.unshift(newRecord);
    this.rebuildIndexes();
    this.save();
    return newRecord;
  }

  updateConstituent(id, data) {
    const idx = this.constituents.findIndex(c => c.id === id);
    if (idx === -1) return null;

    const current = this.constituents[idx];
    this.constituents[idx] = { ...current, ...data };
    this.rebuildIndexes();
    this.save();
    return this.constituents[idx];
  }

  deleteConstituent(id) {
    const idx = this.constituents.findIndex(c => c.id === id);
    if (idx === -1) return false;
    this.constituents.splice(idx, 1);
    this.rebuildIndexes();
    this.save();
    return true;
  }

  bulkImportConstituents(records) {
    let imported = 0;
    let skipped = 0;
    for (const r of records) {
      if (!r.phone_number) {
        skipped++;
        continue;
      }
      const phone = r.phone_number.trim();
      if (this.idx_phone.has(phone)) {
        skipped++;
        continue;
      }
      const newRec = {
        id: generateUuid(),
        phone_number: phone,
        first_name: r.first_name || '',
        last_name: r.last_name || '',
        national_id: r.national_id || `ID_${Math.floor(10000000 + Math.random() * 90000000)}`,
        county: 'Narok',
        ward: r.ward || 'Narok Town',
        polling_station: r.polling_station || 'Ward Polling Center',
        is_opted_out: Boolean(r.is_opted_out),
        voter_status: r.voter_status || 'registered',
        preferred_channel: r.preferred_channel || 'sms',
        tags: ['csv_bulk_import'],
        created_at: new Date().toISOString()
      };
      this.constituents.unshift(newRec);
      imported++;
    }
    this.rebuildIndexes();
    this.save();
    return { imported, skipped, totalNow: this.constituents.length };
  }

  // Campaigns
  getCampaigns() {
    return [...this.campaigns].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  createCampaign(data) {
    const targetWard = data.target_ward && data.target_ward !== 'all' ? data.target_ward : null;
    
    // Count recipients
    let recipients = this.constituents.filter(c => !c.is_opted_out);
    if (targetWard) {
      recipients = recipients.filter(c => c.ward && c.ward.toLowerCase() === targetWard.toLowerCase());
    }

    const costPerSms = 0.80; // KES
    const totalCount = recipients.length;
    const estCost = Number((totalCount * costPerSms).toFixed(2));

    const newCampaign = {
      id: generateUuid(),
      campaign_name: data.campaign_name,
      channel: data.channel || 'sms',
      sender_id: data.sender_id || 'NAROK_TALK',
      message_body: data.message_body,
      target_ward: targetWard,
      status: data.immediate ? 'completed' : (data.scheduled_at ? 'scheduled' : 'pending'),
      scheduled_at: data.scheduled_at || new Date().toISOString(),
      total_recipients: totalCount,
      successful_deliveries: data.immediate ? totalCount : 0,
      failed_deliveries: 0,
      estimated_cost_kes: estCost,
      social_sync_enabled: Boolean(data.social_sync_enabled),
      created_at: new Date().toISOString()
    };

    this.campaigns.unshift(newCampaign);

    // If social sync enabled, create corresponding Meta & X sync entry
    if (newCampaign.social_sync_enabled) {
      this.socialSyncAds.unshift({
        id: generateUuid(),
        campaign_id: newCampaign.id,
        platform: 'both',
        ad_headline: newCampaign.campaign_name,
        ad_copy: newCampaign.message_body.replace(/\{first_name\}/g, 'Wazalendo').replace(/\{ward\}/g, targetWard || 'Narok County'),
        target_ward: targetWard,
        audience_hash_count: totalCount,
        match_rate_percentage: 88.5,
        ad_status: 'synced',
        created_at: new Date().toISOString()
      });
    }

    this.save();
    return newCampaign;
  }

  // Sender IDs
  getSenderIds() {
    return this.senderIds;
  }

  createSenderId(data) {
    const rawName = (data.sender_name || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 11);
    if (!rawName) {
      throw new Error('Please provide a valid alphanumeric Sender ID (max 11 characters).');
    }
    if (this.senderIds.some(s => s.sender_name === rawName)) {
      throw new Error(`Sender ID "${rawName}" is already registered.`);
    }

    const carrierRoute = data.carrier_route || data.network_provider || 'Safaricom Direct SMPP & Corporate SIM';
    const newSender = {
      id: generateUuid(),
      sender_name: rawName,
      candidate_or_party: data.candidate_or_party || 'Narok Campaign Team',
      category: data.category || 'Official Campaign Outreach',
      status: 'approved', // auto-approve for immediate bulk messaging
      network_provider: carrierRoute,
      carrier_route: carrierRoute,
      sim_slot: data.sim_slot || 'Slot 1: Safaricom Corporate GSM',
      sim_number: data.sim_number || '+254722' + Math.floor(100000 + Math.random() * 900000),
      throughput: data.throughput || '500 SMS/sec (Direct SMPP)',
      cak_reference: data.cak_reference || 'CAK/SMS/2026/' + Math.floor(1000 + Math.random() * 9000),
      created_at: new Date().toISOString()
    };
    this.senderIds.unshift(newSender);
    this.save();
    return newSender;
  }

  // Rallies
  getRallies() {
    return [...this.rallies].sort((a, b) => new Date(a.rally_date) - new Date(b.rally_date));
  }

  createRally(data) {
    const newRally = {
      id: generateUuid(),
      rally_title: data.rally_title,
      venue: data.venue,
      ward: data.ward || 'Narok Town',
      rally_date: data.rally_date,
      chief_guest: data.chief_guest || 'Hon. Ledirama Ole Senteu',
      expected_turnout: parseInt(data.expected_turnout) || 5000,
      actual_rsvps: 0,
      status: 'upcoming',
      image_url: data.image_url || 'assets/banner.jpg',
      created_at: new Date().toISOString()
    };
    this.rallies.push(newRally);
    this.save();
    return newRally;
  }

  updateRallyPhoto(rallyId, photoUrl) {
    const rally = this.rallies.find(r => r.id === rallyId);
    if (rally) {
      rally.image_url = photoUrl;
      this.save();
      return rally;
    }
    return null;
  }

  rsvpRally(rallyId) {
    const rally = this.rallies.find(r => r.id === rallyId);
    if (rally) {
      rally.actual_rsvps += 1;
      this.save();
      return rally;
    }
    return null;
  }

  // Social Media Sync
  getSocialSyncAds() {
    return this.socialSyncAds;
  }

  // Automations
  getAutomations() {
    return this.automations;
  }

  toggleAutomation(id) {
    const item = this.automations.find(a => a.id === id);
    if (item) {
      item.is_active = !item.is_active;
      this.save();
      return item;
    }
    return null;
  }

  // Platform Stats
  getStats() {
    const totalConstituents = this.constituents.length;
    const activeConstituents = this.constituents.filter(c => !c.is_opted_out).length;
    const optedOut = totalConstituents - activeConstituents;
    const totalCampaigns = this.campaigns.length;
    const totalSenderIds = this.senderIds.length;
    const totalRallies = this.rallies.length;
    const totalDispatches = this.campaigns.reduce((acc, c) => acc + (c.successful_deliveries || 0), 0);
    const totalBudgetSpentKes = this.campaigns.reduce((acc, c) => acc + (Number(c.estimated_cost_kes) || 0), 0);

    // Distribution by ward
    const wardCounts = {};
    for (const c of this.constituents) {
      const w = c.ward || 'Unassigned';
      wardCounts[w] = (wardCounts[w] || 0) + 1;
    }

    return {
      totalConstituents,
      activeConstituents,
      optedOut,
      totalCampaigns,
      totalSenderIds,
      totalRallies,
      totalDispatches,
      totalBudgetSpentKes,
      wardCounts,
      narokWards: NAROK_WARDS,
      allWards: ALL_WARDS
    };
  }

  // Interactive SQL Query Engine for user-facing Schema Playground
  executeSql(query) {
    const startTime = process.hrtime();
    const cleanSql = query.trim().replace(/;+$/, '');
    const lower = cleanSql.toLowerCase();

    let rows = [];
    let explanation = '';
    let indexesUsed = [];

    if (lower.startsWith('select')) {
      if (lower.includes('from constituents')) {
        let list = [...this.constituents];

        // Ward filter
        const wardMatch = cleanSql.match(/ward\s*=\s*['"]([^'"]+)['"]/i);
        if (wardMatch) {
          const wardTarget = wardMatch[1].trim().toLowerCase();
          indexesUsed.push('idx_constituents_ward (B-Tree Index Scan)');
          const ids = this.idx_ward.get(wardTarget) || new Set();
          list = list.filter(c => ids.has(c.id));
        }

        // Opt out filter
        if (lower.includes('is_opted_out = false') || lower.includes('is_opted_out is false')) {
          indexesUsed.push('idx_constituents_optout (Bitmap Index Scan)');
          list = list.filter(c => !c.is_opted_out);
        } else if (lower.includes('is_opted_out = true') || lower.includes('is_opted_out is true')) {
          indexesUsed.push('idx_constituents_optout (Bitmap Index Scan)');
          list = list.filter(c => c.is_opted_out);
        }

        // Phone filter
        const phoneMatch = cleanSql.match(/phone_number\s*=\s*['"]([^'"]+)['"]/i);
        if (phoneMatch) {
          indexesUsed.push('idx_constituents_phone (Unique Index Lookup)');
          const p = phoneMatch[1].trim();
          list = this.idx_phone.has(p) ? [this.idx_phone.get(p)] : [];
        }

        // Limit
        const limitMatch = cleanSql.match(/limit\s+(\d+)/i);
        const limit = limitMatch ? parseInt(limitMatch[1], 10) : 50;

        rows = list.slice(0, limit);
        explanation = indexesUsed.length > 0 
          ? `Executed via: ${indexesUsed.join(' -> ')}` 
          : 'Sequential Scan (Seq Scan) across table `constituents`';
      } else if (lower.includes('from campaigns')) {
        rows = this.campaigns.slice(0, 50);
        explanation = 'Sequential Scan across `campaigns`';
      } else if (lower.includes('from sender_ids')) {
        rows = this.senderIds;
        explanation = 'Index Scan on `sender_ids` PK';
      } else if (lower.includes('from rally_events') || lower.includes('from rallies')) {
        rows = this.rallies;
        explanation = 'Index Scan on `rally_events`';
      } else {
        throw new Error('Unsupported table in custom SQL playground. Try `SELECT * FROM constituents WHERE ward = \'Kilgoris Central\' AND is_opted_out = false;`');
      }
    } else {
      throw new Error('Only SELECT queries are allowed in this demonstration sandbox.');
    }

    const diff = process.hrtime(startTime);
    const executionTimeMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(3);

    return {
      query: cleanSql,
      rowCount: rows.length,
      executionTimeMs,
      explanation,
      indexesUsed,
      rows
    };
  }
}

const db = new Database();

module.exports = {
  db,
  NAROK_WARDS,
  ALL_WARDS
};
