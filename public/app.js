const $ = (id) => document.getElementById(id);
const MAX = 60;
const COLORS = { accent: '#38bdf8', violet: '#a78bfa', warn: '#fbbf24', crit: '#f87171' };
const LEVEL_CLASS = { ok: 'text-emerald-400', warn: 'text-amber-300', crit: 'text-red-400', info: 'text-slate-400' };

// ---- Translations (English is the default) ----
const I18N = {
  en: {
    title: 'Watchtower | System Monitor',
    'host.waiting': 'waiting for server info…',
    'host.info': '{host} · {os} · {cores} cores · {cpu}',
    'net.title': 'Network traffic', 'uptime.title': 'Uptime', 'uptime.since': 'since last boot',
    'chart.cpuram': 'CPU & RAM', 'chart.last60': 'last 60 samples',
    'chart.cpuram.aria': 'CPU and RAM line chart', 'chart.net.aria': 'Network traffic line chart',
    'svc.title': 'Service status', 'svc.sub': 'Checked every 10 seconds', 'svc.offline': 'offline',
    'log.title': 'Event log', 'test.btn': 'Test alert', 'footer.portfolio': 'portfolio',
    limits: 'Limits: CPU {cpu}% · RAM {ram}% · Discord alerts {discord}', on: 'on', off: 'off',
    'status.connecting': 'Connecting…', 'status.open': 'Live', 'status.closed': 'Connection lost, retrying…',
    'u.d': '{d}d {h}h {m}m', 'u.h': '{h}h {m}m', 'u.m': '{m}m {s}s',
    'leg.cpu': 'CPU %', 'leg.ram': 'RAM %', 'leg.down': 'Download', 'leg.up': 'Upload',
    'ev.connected': 'Connected to the panel',
    'ev.cpu_high': 'CPU load {v}% (limit {limit}%)', 'ev.ram_high': 'RAM usage {v}% (limit {limit}%)',
    'ev.svc_down': '{name} is not responding', 'ev.svc_up': '{name} is back online',
    'ev.test': 'Test alert: notification pipeline works',
  },
  tr: {
    title: 'Watchtower | Sistem İzleme Paneli',
    'host.waiting': 'sunucu bilgisi bekleniyor…',
    'host.info': '{host} · {os} · {cores} çekirdek · {cpu}',
    'net.title': 'Ağ trafiği', 'uptime.title': 'Çalışma süresi', 'uptime.since': 'son açılıştan beri',
    'chart.cpuram': 'CPU ve RAM', 'chart.last60': 'son 60 ölçüm',
    'chart.cpuram.aria': 'CPU ve RAM çizgi grafiği', 'chart.net.aria': 'Ağ trafiği çizgi grafiği',
    'svc.title': 'Servis durumu', 'svc.sub': 'Her 10 saniyede bir kontrol edilir', 'svc.offline': 'çevrimdışı',
    'log.title': 'Olay günlüğü', 'test.btn': 'Alarmı test et', 'footer.portfolio': 'portfolyo',
    limits: 'Eşikler: CPU %{cpu} · RAM %{ram} · Discord bildirimi {discord}', on: 'açık', off: 'kapalı',
    'status.connecting': 'Bağlanıyor…', 'status.open': 'Canlı', 'status.closed': 'Bağlantı koptu, yeniden deneniyor…',
    'u.d': '{d}g {h}s {m}dk', 'u.h': '{h}s {m}dk', 'u.m': '{m}dk {s}sn',
    'leg.cpu': 'CPU %', 'leg.ram': 'RAM %', 'leg.down': 'İndirme', 'leg.up': 'Yükleme',
    'ev.connected': 'Panele bağlanıldı',
    'ev.cpu_high': 'CPU yükü %{v} (eşik %{limit})', 'ev.ram_high': 'RAM kullanımı %{v} (eşik %{limit})',
    'ev.svc_down': '{name} yanıt vermiyor', 'ev.svc_up': '{name} tekrar çevrimiçi',
    'ev.test': 'Test uyarısı: bildirim hattı çalışıyor',
  },
};

let lang = 'en';
try { lang = localStorage.getItem('wt-lang') || 'en'; } catch { /* storage can be unavailable */ }
if (!I18N[lang]) lang = 'en';

const t = (key, p = {}) =>
  (I18N[lang][key] ?? I18N.en[key] ?? key).replace(/\{(\w+)\}/g, (_, n) => p[n] ?? '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = (ts) => new Date(ts).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-GB');
const rate = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB/s' : (b / 1024).toFixed(0) + ' KB/s');

function uptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? t('u.d', { d, h, m }) : h ? t('u.h', { h, m }) : t('u.m', { m, s: s % 60 });
}

function fmtEvent(e) {
  const key = 'ev.' + e.code;
  return `[${clock(e.ts)}] ${I18N.en[key] ? t(key, e.params) : e.msg}`;
}

// ---- State used to re-render when the language changes ----
let state = 'connecting', lastHello = null, lastServices = [], lastStats = null;

// ---- Charts ----
function makeChart(id, datasets, yMax) {
  return new Chart($(id), {
    type: 'line',
    data: {
      labels: [],
      datasets: datasets.map((d) => ({ ...d, data: [], borderWidth: 2, tension: 0.35, pointRadius: 0, fill: true, backgroundColor: d.borderColor + '22' })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#a6afc2', boxWidth: 10 } } },
      scales: {
        x: { ticks: { color: '#6b7488', maxTicksLimit: 6 }, grid: { display: false } },
        y: { min: 0, max: yMax, beginAtZero: true, ticks: { color: '#6b7488' }, grid: { color: 'rgba(255,255,255,.06)' }, border: { display: false } },
      },
    },
  });
}

const cpuChart = makeChart('cpu-chart', [{ borderColor: COLORS.accent }, { borderColor: COLORS.violet }], 100);
const netChart = makeChart('net-chart', [{ borderColor: COLORS.accent }, { borderColor: COLORS.violet }]);

function addPoint(s) {
  const rows = [[cpuChart, [s.cpu, s.ramPct]], [netChart, [s.rx / 1024, s.tx / 1024]]];
  for (const [chart, values] of rows) {
    chart.data.labels.push(clock(s.ts));
    values.forEach((v, i) => chart.data.datasets[i].data.push(v));
    if (chart.data.labels.length > MAX) {
      chart.data.labels.shift();
      chart.data.datasets.forEach((d) => d.data.shift());
    }
    chart.update('none');
  }
}

// ---- Rendering ----
function setRing(id, pct) {
  const el = $(id);
  el.style.strokeDashoffset = 213.6 * (1 - Math.min(pct, 100) / 100);
  el.style.stroke = pct >= 90 ? COLORS.crit : pct >= 75 ? COLORS.warn : COLORS.accent;
}

function updateCards(s) {
  lastStats = s;
  $('cpu-text').textContent = s.cpu.toFixed(1);
  $('ram-text').textContent = s.ramPct.toFixed(1);
  $('ram-detail').textContent = `${s.usedMem} / ${s.totalMem} GB`;
  $('rx-text').textContent = rate(s.rx);
  $('tx-text').textContent = rate(s.tx);
  $('uptime-text').textContent = uptime(s.uptime);
  setRing('cpu-ring', s.cpu);
  setRing('ram-ring', s.ramPct);
}

function render(s) {
  updateCards(s);
  addPoint(s);
}

function renderServices(list) {
  lastServices = list;
  $('services').innerHTML = list.map((s) => {
    const dot = s.up === null ? 'bg-slate-500' : s.up ? 'bg-emerald-400' : 'bg-red-500';
    const label = s.up === null ? '–' : s.up ? `${s.latency} ms` : t('svc.offline');
    return `<li class="flex items-center justify-between py-2.5">
      <span class="flex items-center gap-2"><span class="h-2 w-2 rounded-full ${dot}"></span>${esc(s.name)}</span>
      <span class="mono text-xs ${s.up === false ? 'text-red-400' : 'text-slate-400'}">${label}</span></li>`;
  }).join('');
}

function addEvent(e) {
  const li = document.createElement('li');
  li.className = LEVEL_CLASS[e.level] || LEVEL_CLASS.info;
  li._e = e;
  li.textContent = fmtEvent(e);
  const log = $('log');
  log.prepend(li);
  while (log.children.length > 50) log.lastChild.remove();
}

function setStatus(next) {
  state = next;
  const dots = { connecting: 'bg-amber-400 animate-pulse', open: 'bg-emerald-400', closed: 'bg-red-500' };
  $('status-dot').className = 'pulse h-2.5 w-2.5 rounded-full ' + dots[state];
  $('status-text').textContent = t('status.' + state);
}

function renderInfo() {
  if (!lastHello) return;
  const m = lastHello;
  $('host-info').textContent = t('host.info', { host: m.info.host, os: m.info.os, cores: m.info.cores, cpu: m.info.cpu });
  $('limits').textContent = t('limits', { cpu: m.limits.cpu, ram: m.limits.ram, discord: t(m.webhook ? 'on' : 'off') });
}

function applyLang() {
  document.documentElement.lang = lang;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  document.querySelectorAll('#lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  ['leg.cpu', 'leg.ram'].forEach((k, i) => { cpuChart.data.datasets[i].label = t(k); });
  ['leg.down', 'leg.up'].forEach((k, i) => { netChart.data.datasets[i].label = t(k); });
  cpuChart.update('none');
  netChart.update('none');
  setStatus(state);
  renderInfo();
  renderServices(lastServices);
  document.querySelectorAll('#log li').forEach((li) => { li.textContent = fmtEvent(li._e); });
  if (lastStats) $('uptime-text').textContent = uptime(lastStats.uptime);
}

function onHello(m) {
  lastHello = m;
  renderInfo();
  [cpuChart, netChart].forEach((c) => { c.data.labels = []; c.data.datasets.forEach((d) => (d.data = [])); });
  m.history.forEach(addPoint);
  if (m.history.length) updateCards(m.history[m.history.length - 1]);
  renderServices(m.services);
  $('log').innerHTML = '';
  m.events.forEach(addEvent);
  addEvent({ ts: Date.now(), level: 'info', code: 'connected', params: {}, msg: 'Connected to the panel' });
}

// ---- WebSocket: reconnects with exponential backoff ----
let ws, delay = 1000;
function connect() {
  setStatus('connecting');
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => { delay = 1000; setStatus('open'); };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'hello') onHello(m);
    else if (m.type === 'stats') render(m.stats);
    else if (m.type === 'services') renderServices(m.services);
    else if (m.type === 'event') addEvent(m.event);
  };
  ws.onclose = () => { setStatus('closed'); setTimeout(connect, delay); delay = Math.min(delay * 2, 15000); };
  ws.onerror = () => ws.close();
}

$('test-btn').addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'test-alert' }));
});

document.querySelectorAll('#lang button').forEach((b) => b.addEventListener('click', () => {
  lang = b.dataset.lang;
  try { localStorage.setItem('wt-lang', lang); } catch { /* ignore */ }
  applyLang();
}));

applyLang();
connect();
