// ========================================================
// TALK SASA — ANALYTICS & DATA VISUALIZATION DASHBOARD
// ========================================================

let wardBarChart = null;
let channelDonutChart = null;
let campaignLineChart = null;
let voterStatusChart = null;
let subcountyRadarChart = null;
let activeChartView = "ward";

const NAROK_WARD_VOTERS = {
  "Kilgoris Central": 14800, "Keyian": 12300, "Angata Barikoi": 13500,
  "Shankoe": 11200, "Kimintet": 10900, "Lolgorian": 11500,
  "Olposimoru": 15700, "Olokurto": 16100, "Narok Town": 17800,
  "Nkware": 13200, "Melili": 12600, "Olorropil": 13100,
  "Maji Moto/Naroosura": 14500, "Ololulunga": 15300, "Melelo": 13900,
  "Loita": 16200, "Sogoo": 14100, "Sagamian": 13400,
  "Mosiro": 12900, "Ildamat": 13600, "Keekonyokie": 13200, "Suswa": 12400,
  "Ilmotiok": 15900, "Mara": 17200, "Siana": 15100, "Naikarra": 14800,
  "Ilkerin": 11100, "Ololmasani": 10800, "Mogondo": 11900, "Kapsasian": 10500
};

const SUBCOUNTY_DATA = [
  { name: "Kilgoris", voters: 84200, wards: 6, smsRate: 91, whatsappRate: 78, voiceRate: 62 },
  { name: "Narok North", voters: 98500, wards: 6, smsRate: 94, whatsappRate: 85, voiceRate: 58 },
  { name: "Narok South", voters: 92400, wards: 6, smsRate: 88, whatsappRate: 72, voiceRate: 71 },
  { name: "Narok East", voters: 52100, wards: 4, smsRate: 86, whatsappRate: 68, voiceRate: 65 },
  { name: "Narok West", voters: 65800, wards: 4, smsRate: 89, whatsappRate: 81, voiceRate: 73 },
  { name: "Emurua Dikirr", voters: 44300, wards: 4, smsRate: 84, whatsappRate: 64, voiceRate: 69 }
];

const CHANNEL_PERFORMANCE = {
  sms: { sent: 284500, delivered: 280200, failed: 4300, rate: 98.5, cost: 227600 },
  whatsapp: { sent: 147300, delivered: 146100, failed: 1200, rate: 99.2, cost: 73650 },
  email: { sent: 62400, delivered: 61700, failed: 700, rate: 98.9, cost: 6240 },
  voice: { sent: 38700, delivered: 37800, failed: 900, rate: 97.7, cost: 58050 },
  social: { sent: 94200, delivered: 94200, failed: 0, rate: 100, cost: 207240 }
};

const CAMPAIGN_TRENDS = [
  { month: "Apr 2026", sms: 28400, whatsapp: 12100, email: 5200, voice: 3100 },
  { month: "May 2026", sms: 36200, whatsapp: 15800, email: 7400, voice: 3900 },
  { month: "Jun 2026", sms: 42100, whatsapp: 19400, email: 8900, voice: 4600 },
  { month: "Jul 2026", sms: 51800, whatsapp: 24600, email: 10200, voice: 5400 },
  { month: "Aug 2026", sms: 63400, whatsapp: 31200, email: 13600, voice: 6800 },
  { month: "Sep 2026", sms: 62600, whatsapp: 44200, email: 17100, voice: 15900 }
];

const VOTER_STATUS = {
  registered: 312400,
  youth_first_time: 84600,
  elder: 18700,
  diaspora: 4300
};

function getThemeColors() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    gridColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
    textColor: isDark ? "#a0b4ab" : "#4a5c53",
    tickColor: isDark ? "#7a9488" : "#7d8f86",
    forest: "#1e3f32",
    gold: "#ffad00",
    green: "#10b981",
    blue: "#2563eb",
    red: "#ef4444"
  };
}

function getChartDefaults() {
  const t = getThemeColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: t.textColor, font: { family: "Outfit", weight: "600", size: 12 }, padding: 16 }
      },
      tooltip: {
        backgroundColor: "rgba(15, 31, 24, 0.95)",
        borderColor: "#1e3f32",
        borderWidth: 1,
        titleColor: "#ffad00",
        bodyColor: "#d4e4dc",
        padding: 12,
        cornerRadius: 8,
        titleFont: { family: "Outfit", weight: "800", size: 13 },
        bodyFont: { family: "JetBrains Mono", size: 11 }
      }
    },
    scales: {
      x: {
        grid: { color: t.gridColor, drawBorder: false },
        ticks: { color: t.tickColor, font: { family: "Outfit", weight: "600", size: 11 } }
      },
      y: {
        grid: { color: t.gridColor, drawBorder: false },
        ticks: { color: t.tickColor, font: { family: "JetBrains Mono", size: 10 } }
      }
    }
  };
}

function renderWardBarChart(wardData) {
  const ctx = document.getElementById("wardBarChartCanvas");
  if (!ctx) return;
  const labels = Object.keys(wardData).sort((a, b) => wardData[b] - wardData[a]).slice(0, 15);
  const data = labels.map(w => wardData[w]);
  const gradientColors = labels.map((_, i) => "hsl(" + (145 + i * 8) + ", 45%, 38%)");
  if (wardBarChart) wardBarChart.destroy();
  wardBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Indexed Voters",
        data,
        backgroundColor: gradientColors,
        borderColor: gradientColors.map(c => c.replace("38%", "48%")),
        borderWidth: 1.5,
        borderRadius: 6,
        barThickness: 18
      }]
    },
    options: Object.assign({}, getChartDefaults(), {
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: Object.assign({}, getChartDefaults().plugins.tooltip, {
          callbacks: { label: function(ctx) { return " " + ctx.raw.toLocaleString() + " voters indexed"; } }
        })
      },
      scales: {
        x: Object.assign({}, getChartDefaults().scales.x, {
          ticks: Object.assign({}, getChartDefaults().scales.x.ticks, {
            callback: function(v) { return (v / 1000).toFixed(0) + "K"; }
          })
        }),
        y: Object.assign({}, getChartDefaults().scales.y, { grid: { display: false } })
      }
    })
  });
}

function renderChannelDonut() {
  const ctx = document.getElementById("channelDonutCanvas");
  if (!ctx) return;
  const t = getThemeColors();
  const labels = ["Bulk SMS", "WhatsApp", "Email", "Voice IVR", "Social Ads"];
  const data = [CHANNEL_PERFORMANCE.sms.sent, CHANNEL_PERFORMANCE.whatsapp.sent, CHANNEL_PERFORMANCE.email.sent, CHANNEL_PERFORMANCE.voice.sent, CHANNEL_PERFORMANCE.social.sent];
  const colors = [t.forest, "#25d366", "#ea4335", "#f97316", "#1da1f2"];
  if (channelDonutChart) channelDonutChart.destroy();
  channelDonutChart = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: "transparent", hoverOffset: 10, borderRadius: 4 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { position: "bottom", labels: { color: t.textColor, font: { family: "Outfit", weight: "600", size: 11 }, padding: 12, usePointStyle: true, pointStyleWidth: 10 } },
        tooltip: Object.assign({}, getChartDefaults().plugins.tooltip, {
          callbacks: {
            label: function(ctx) {
              var val = ctx.raw;
              var total = ctx.dataset.data.reduce(function(a, b) { return a + b; }, 0);
              return " " + val.toLocaleString() + " messages (" + ((val / total) * 100).toFixed(1) + "%)";
            }
          }
        })
      }
    }
  });
}

function renderCampaignTrends() {
  const ctx = document.getElementById("campaignTrendsCanvas");
  if (!ctx) return;
  const t = getThemeColors();
  const labels = CAMPAIGN_TRENDS.map(d => d.month);
  function mkDs(key, label, color, fill) {
    return { label, data: CAMPAIGN_TRENDS.map(d => d[key]), borderColor: color, backgroundColor: color + (fill ? "22" : "00"), borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: color, fill: fill, tension: 0.4 };
  }
  if (campaignLineChart) campaignLineChart.destroy();
  campaignLineChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [mkDs("sms","Bulk SMS",t.forest,true), mkDs("whatsapp","WhatsApp","#25d366",false), mkDs("email","Email","#ea4335",false), mkDs("voice","Voice IVR",t.gold,false)] },
    options: Object.assign({}, getChartDefaults(), {
      plugins: Object.assign({}, getChartDefaults().plugins, {
        tooltip: Object.assign({}, getChartDefaults().plugins.tooltip, {
          mode: "index", intersect: false,
          callbacks: { label: function(ctx) { return " " + ctx.dataset.label + ": " + ctx.raw.toLocaleString(); } }
        })
      }),
      scales: {
        x: getChartDefaults().scales.x,
        y: Object.assign({}, getChartDefaults().scales.y, {
          ticks: Object.assign({}, getChartDefaults().scales.y.ticks, {
            callback: function(v) { return v >= 1000 ? (v/1000).toFixed(0)+"K" : v; }
          })
        })
      }
    })
  });
}

function renderVoterStatusChart() {
  const ctx = document.getElementById("voterStatusCanvas");
  if (!ctx) return;
  const t = getThemeColors();
  if (voterStatusChart) voterStatusChart.destroy();
  voterStatusChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: ["Registered Voters", "Youth (First-Time)", "Community Elders", "Narok Diaspora"],
      datasets: [{ data: Object.values(VOTER_STATUS), backgroundColor: [t.forest, t.gold, t.green, t.blue], borderColor: "transparent", hoverOffset: 8, borderRadius: 3 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { color: t.textColor, font: { family: "Outfit", weight: "600", size: 11 }, padding: 14, usePointStyle: true } },
        tooltip: Object.assign({}, getChartDefaults().plugins.tooltip, {
          callbacks: { label: function(ctx) { return " " + ctx.raw.toLocaleString() + " voters (" + ((ctx.raw / 420000) * 100).toFixed(1) + "%)"; } }
        })
      }
    }
  });
}

function renderSubcountyRadar() {
  const ctx = document.getElementById("subcountyRadarCanvas");
  if (!ctx) return;
  const t = getThemeColors();
  const labels = SUBCOUNTY_DATA.map(d => d.name);
  if (subcountyRadarChart) subcountyRadarChart.destroy();
  subcountyRadarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [
        { label: "SMS Delivery Rate (%)", data: SUBCOUNTY_DATA.map(d => d.smsRate), borderColor: t.forest, backgroundColor: t.forest+"33", pointBackgroundColor: t.forest, borderWidth: 2, pointRadius: 4 },
        { label: "WhatsApp Delivery (%)", data: SUBCOUNTY_DATA.map(d => d.whatsappRate), borderColor: "#25d366", backgroundColor: "#25d36622", pointBackgroundColor: "#25d366", borderWidth: 2, pointRadius: 4 },
        { label: "Voice IVR Connection (%)", data: SUBCOUNTY_DATA.map(d => d.voiceRate), borderColor: t.gold, backgroundColor: t.gold+"22", pointBackgroundColor: t.gold, borderWidth: 2, pointRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: t.textColor, font: { family: "Outfit", weight: "600", size: 11 }, padding: 14, usePointStyle: true } },
        tooltip: getChartDefaults().plugins.tooltip
      },
      scales: {
        r: {
          min: 55, max: 100,
          ticks: { color: t.tickColor, backdropColor: "transparent", font: { size: 9 }, stepSize: 10 },
          grid: { color: t.gridColor },
          pointLabels: { color: t.textColor, font: { family: "Outfit", weight: "700", size: 11 } }
        }
      }
    }
  });
}

function switchChartView(view) {
  activeChartView = view;
  document.querySelectorAll(".chart-switch-btn").forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset.chart === view);
  });
  document.querySelectorAll(".chart-panel").forEach(function(panel) {
    panel.classList.toggle("active", panel.dataset.panel === view);
  });
  switch (view) {
    case "ward": renderWardBarChart(window._dashboardWardData || NAROK_WARD_VOTERS); break;
    case "channel": renderChannelDonut(); break;
    case "trends": renderCampaignTrends(); break;
    case "status": renderVoterStatusChart(); break;
    case "subcounty": renderSubcountyRadar(); break;
  }
}

function renderChannelStatsTable() {
  const el = document.getElementById("channelStatsTable");
  if (!el) return;
  const rows = [
    { icon: "📱", name: "Bulk SMS", color: "#1e3f32", sent: CHANNEL_PERFORMANCE.sms.sent, rate: CHANNEL_PERFORMANCE.sms.rate, cost: CHANNEL_PERFORMANCE.sms.cost },
    { icon: "💬", name: "WhatsApp Business", color: "#25d366", sent: CHANNEL_PERFORMANCE.whatsapp.sent, rate: CHANNEL_PERFORMANCE.whatsapp.rate, cost: CHANNEL_PERFORMANCE.whatsapp.cost },
    { icon: "✉️", name: "Email Newsletter", color: "#ea4335", sent: CHANNEL_PERFORMANCE.email.sent, rate: CHANNEL_PERFORMANCE.email.rate, cost: CHANNEL_PERFORMANCE.email.cost },
    { icon: "🎙️", name: "Voice IVR Call", color: "#f97316", sent: CHANNEL_PERFORMANCE.voice.sent, rate: CHANNEL_PERFORMANCE.voice.rate, cost: CHANNEL_PERFORMANCE.voice.cost },
    { icon: "📢", name: "Social Sync Ads", color: "#1da1f2", sent: CHANNEL_PERFORMANCE.social.sent, rate: CHANNEL_PERFORMANCE.social.rate, cost: CHANNEL_PERFORMANCE.social.cost }
  ];
  el.innerHTML = rows.map(function(r) {
    return '<div class="channel-stat-row"><div class="channel-stat-icon" style="background:' + r.color + '22;color:' + r.color + ';">' + r.icon + '</div><div class="channel-stat-name"><strong>' + r.name + '</strong><span>' + r.sent.toLocaleString() + ' sent</span></div><div class="channel-stat-bar-wrap"><div class="channel-stat-bar" style="width:' + r.rate + '%;background:' + r.color + ';"></div></div><div class="channel-stat-rate" style="color:' + r.color + ';">' + r.rate + '%</div><div class="channel-stat-cost">KES ' + r.cost.toLocaleString() + '</div></div>';
  }).join("");
}

function renderSubcountyCards() {
  const el = document.getElementById("subcountyCardsGrid");
  if (!el) return;
  const icons = ["🦁", "🌿", "🏔️", "☀️", "🌊", "⛰️"];
  el.innerHTML = SUBCOUNTY_DATA.map(function(sc, i) {
    return '<div class="subcounty-analytics-card"><div class="sc-card-icon">' + icons[i] + '</div><div class="sc-card-body"><div class="sc-card-name">' + sc.name + '</div><div class="sc-card-voters">' + sc.voters.toLocaleString() + ' <span>voters</span></div><div class="sc-card-wards">' + sc.wards + ' Wards</div><div class="sc-card-bars"><div class="sc-bar-row"><span>SMS</span><div class="sc-mini-bar"><div style="width:' + sc.smsRate + '%;background:#1e3f32;"></div></div><span class="sc-bar-val">' + sc.smsRate + '%</span></div><div class="sc-bar-row"><span>WA</span><div class="sc-mini-bar"><div style="width:' + sc.whatsappRate + '%;background:#25d366;"></div></div><span class="sc-bar-val">' + sc.whatsappRate + '%</span></div><div class="sc-bar-row"><span>IVR</span><div class="sc-mini-bar"><div style="width:' + sc.voiceRate + '%;background:#ffad00;"></div></div><span class="sc-bar-val">' + sc.voiceRate + '%</span></div></div></div></div>';
  }).join("");
}

function animateCountUp(el, target, duration) {
  if (!el) return;
  duration = duration || 1800;
  var startTime = performance.now();
  function step(now) {
    var elapsed = now - startTime;
    var progress = Math.min(elapsed / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderRollingMetrics(wardData) {
  var totalVoters = Object.values(wardData || NAROK_WARD_VOTERS).reduce(function(a,b){return a+b;}, 0);
  var totalMessages = Object.values(CHANNEL_PERFORMANCE).reduce(function(a,c){return a+c.sent;}, 0);
  var totalDelivered = Object.values(CHANNEL_PERFORMANCE).reduce(function(a,c){return a+c.delivered;}, 0);
  var totalCost = Object.values(CHANNEL_PERFORMANCE).reduce(function(a,c){return a+c.cost;}, 0);
  animateCountUp(document.getElementById("dashTotalVoters"), totalVoters);
  animateCountUp(document.getElementById("dashTotalMessages"), totalMessages);
  animateCountUp(document.getElementById("dashTotalDelivered"), totalDelivered);
  animateCountUp(document.getElementById("dashTotalCost"), totalCost);
}

async function initDashboard() {
  try {
    var res = await fetch("/api/stats");
    var json = await res.json();
    if (json.success && json.data && json.data.wardCounts) {
      var merged = Object.assign({}, NAROK_WARD_VOTERS, json.data.wardCounts);
      window._dashboardWardData = merged;
    } else {
      window._dashboardWardData = NAROK_WARD_VOTERS;
    }
  } catch(e) {
    window._dashboardWardData = NAROK_WARD_VOTERS;
  }
  renderChannelStatsTable();
  renderSubcountyCards();
  renderRollingMetrics(window._dashboardWardData);
  document.querySelectorAll(".chart-switch-btn").forEach(function(btn) {
    btn.addEventListener("click", function() { switchChartView(btn.dataset.chart); });
  });
  switchChartView("ward");
  var themeBtn = document.getElementById("themeToggleBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", function() {
      setTimeout(function() { switchChartView(activeChartView); }, 100);
    });
  }
}

window.initDashboard = initDashboard;
window.switchChartView = switchChartView;

document.addEventListener("DOMContentLoaded", function() {
  if (document.getElementById("dashboardAnalyticsSection")) {
    initDashboard();
  }
});
