// ========================================================
// INTERACTIVE SYSTEM ARCHITECTURE & TELEMETRY MODULE
// ========================================================

const nodeDefinitions = {
  'node-frontend': {
    tag: 'CLIENT LAYER',
    name: 'Talk Sasa Frontend',
    sub: 'React / Vue Dashboard',
    status: 'Operational (99.98%)',
    desc: 'Interactive campaign command center providing CRM voter directory, omnichannel composer, and live telemetry.',
    m1Label: 'Render Performance',
    m1Val: '60 FPS | 142 KB bundle',
    m2Label: 'Active Operator Sessions',
    m2Val: '82 campaign workers active'
  },
  'node-gateway': {
    tag: 'GATEWAY',
    name: 'API Gateway & Load Balancer',
    sub: 'Kong / NGINX Ingress',
    status: 'Operational (99.98%)',
    desc: 'Central entry point enforcing rate limits, JWT validation, and intelligent routing across microservices.',
    m1Label: 'Latency / Throughput',
    m1Val: '12ms avg | 4.2k req/s',
    m2Label: 'Active Connections',
    m2Val: '3,150 active connections'
  },
  'node-crm': {
    tag: 'MICROSERVICE',
    name: 'CRM Core Service',
    sub: 'Segmentation Engine',
    status: 'Healthy (99.99%)',
    desc: 'High-speed voter segmentation engine indexing 420K+ constituents across all 30 Narok County wards.',
    m1Label: 'Query Latency & Cache',
    m1Val: '2.1ms avg | 96.4% cache hit',
    m2Label: 'Indexed Directory Records',
    m2Val: '420,000+ constituents'
  },
  'node-omnichannel': {
    tag: 'MICROSERVICE',
    name: 'Omnichannel Engine',
    sub: 'Dispatch Router & Queue',
    status: 'Healthy (99.95%)',
    desc: 'Asynchronous dispatch router balancing bulk SMS, WhatsApp Cloud API, and Email priority queues.',
    m1Label: 'Throughput & Queue Depth',
    m1Val: '350 msg/s | 14 in queue',
    m2Label: 'Active Dispatch Channels',
    m2Val: 'SMS, WhatsApp, Email, Voice'
  },
  'node-socialsync': {
    tag: 'MICROSERVICE',
    name: 'Social Media Sync',
    sub: 'Ads & Audience Sync',
    status: 'Healthy (99.90%)',
    desc: 'Synchronizes direct SMS & WhatsApp rally broadcasts with sponsored ads on Facebook and X (Twitter).',
    m1Label: 'Sync State & Freshness',
    m1Val: 'Active | Last synced 3m ago',
    m2Label: 'Hashed Audience Match',
    m2Val: '18,400 constituents matched'
  },
  'node-postgres': {
    tag: 'DATA STORE',
    name: 'Primary Database',
    sub: 'PostgreSQL + Redis',
    status: 'Healthy (100%)',
    desc: 'Relational data store with B-Tree indexes on ward and phone_number for sub-millisecond filtering.',
    m1Label: 'Replica Lag & Active Pool',
    m1Val: '0.8ms lag | 24 active pool conns',
    m2Label: 'Data Volume & Redis Rate',
    m2Val: '4.8 GB | 12.4k ops/sec'
  },
  'node-africastalking': {
    tag: 'EXTERNAL API',
    name: 'SMS / Voice Gateway',
    sub: 'Africa\'s Talking (SMPP)',
    status: 'Connected & Bound (99.9%)',
    desc: 'Licensed telecom aggregator providing SMPP binding to Safaricom, Airtel, and Telkom Kenya.',
    m1Label: 'Delivery Rate & Latency',
    m1Val: '98.8% delivery | 18ms latency',
    m2Label: 'SMS Credit Balance',
    m2Val: 'KES 148,500.00'
  },
  'node-whatsappmeta': {
    tag: 'EXTERNAL API',
    name: 'WhatsApp Business',
    sub: 'Meta Cloud API',
    status: 'High Tier (Green)',
    desc: 'Official Meta Cloud API endpoint delivering interactive templates, media rally posters, and chatbots.',
    m1Label: 'Tier Limit & Quality',
    m1Val: '100K msgs/day | Green (High)',
    m2Label: 'Avg Delivery Latency',
    m2Val: '24ms delivery time'
  },
  'node-socialgraph': {
    tag: 'EXTERNAL API',
    name: 'Meta & X Ads',
    sub: 'Graph APIs',
    status: 'Connected & Synced',
    desc: 'REST APIs for creating Custom Audiences and triggering promoted posts on Facebook & X.',
    m1Label: 'API Rate Limits Remaining',
    m1Val: '94% rate quota remaining',
    m2Label: 'Sync Audience Status',
    m2Val: 'Active Campaign Audiences'
  }
};

let currentSelectedNodeId = 'node-gateway';

function initArchitectureTelemetry() {
  const nodes = document.querySelectorAll('.arch-node');
  nodes.forEach(node => {
    node.addEventListener('click', () => {
      nodes.forEach(n => n.classList.remove('selected'));
      node.classList.add('selected');
      currentSelectedNodeId = node.id;
      inspectNodeTelemetry(node.id);
    });
  });

  // Layer Checkboxes
  const layerCheckboxes = document.querySelectorAll('.layer-checkbox-label input[type="checkbox"]');
  layerCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      applyLayerFilters();
    });
  });

  // Initial selection
  inspectNodeTelemetry('node-gateway');
}

function applyLayerFilters() {
  const activeLayers = new Set();
  document.querySelectorAll('.layer-checkbox-label input[type="checkbox"]').forEach(cb => {
    if (cb.checked) {
      activeLayers.add(cb.dataset.layer);
    }
  });

  const nodes = document.querySelectorAll('.arch-node');
  nodes.forEach(node => {
    const layer = node.dataset.layer;
    if (activeLayers.has(layer)) {
      node.style.opacity = '1';
      node.style.pointerEvents = 'auto';
      node.style.filter = 'none';
    } else {
      node.style.opacity = '0.2';
      node.style.pointerEvents = 'none';
      node.style.filter = 'grayscale(100%)';
    }
  });
}

function inspectNodeTelemetry(nodeId) {
  const def = nodeDefinitions[nodeId];
  if (!def) return;

  const elTag = document.getElementById('telTag');
  const elName = document.getElementById('telName');
  const elStatus = document.getElementById('telStatus');
  const elDesc = document.getElementById('telDesc');
  const elM1Label = document.getElementById('telMetric1Label');
  const elM1Val = document.getElementById('telMetric1Val');
  const elM2Label = document.getElementById('telMetric2Label');
  const elM2Val = document.getElementById('telMetric2Val');

  if (elTag) elTag.textContent = def.tag;
  if (elName) elName.textContent = def.name;
  if (elStatus) elStatus.textContent = def.status;
  if (elDesc) elDesc.textContent = def.desc;
  if (elM1Label) elM1Label.textContent = def.m1Label;
  if (elM1Val) elM1Val.textContent = def.m1Val;
  if (elM2Label) elM2Label.textContent = def.m2Label;
  if (elM2Val) elM2Val.textContent = def.m2Val;
}

// Live update of telemetry values when polled
function renderTelemetryDetail(telemetryData) {
  if (!telemetryData) return;

  // If gateway is selected, update dynamic metrics
  if (currentSelectedNodeId === 'node-gateway' && telemetryData.gateway) {
    const g = telemetryData.gateway;
    const elM1Val = document.getElementById('telMetric1Val');
    const elM2Val = document.getElementById('telMetric2Val');
    if (elM1Val) elM1Val.textContent = `${g.latencyMs}ms avg | ${(g.throughputReqSec / 1000).toFixed(1)}k req/s`;
    if (elM2Val) elM2Val.textContent = `${g.activeConnections.toLocaleString()} active connections`;
  }
}

document.addEventListener('DOMContentLoaded', initArchitectureTelemetry);

window.initArchitectureTelemetry = initArchitectureTelemetry;
window.renderTelemetryDetail = renderTelemetryDetail;
