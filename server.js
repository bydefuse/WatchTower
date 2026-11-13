const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const si = require('systeminformation');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* .env is optional */ }

const GB = 1024 ** 3;
const cfg = {
  port: +process.env.PORT || 3000,
  host: process.env.HOST || '127.0.0.1', // default: reachable from this machine only
  interval: +process.env.INTERVAL_MS || 1500,
  cpuLimit: +process.env.CPU_ALERT || 90,
  ramLimit: +process.env.RAM_ALERT || 90,
  cooldown: (+process.env.ALERT_COOLDOWN_SEC || 300) * 1000,
  webhook: process.env.DISCORD_WEBHOOK_URL || '',
};

function loadServices() {
  const file = path.join(__dirname, 'services.json');
  try {
    // {PORT} placeholder keeps the self health check valid when PORT changes
    return JSON.parse(fs.readFileSync(file, 'utf8').replaceAll('{PORT}', cfg.port));
  } catch (err) {
    console.warn(`Could not read services.json (${err.code || err.message}), using the default list`);
    return [{ name: 'Watchtower (this panel)', type: 'http', target: `http://127.0.0.1:${cfg.port}/health` }];
  }
}

const services = loadServices()
  .map((s) => ({ ...s, up: null, latency: null, checkedAt: null }));

const info = {
  host: os.hostname(),
  os: `${os.type()} ${os.release()}`,
  cpu: os.cpus()[0]?.model.trim() || 'CPU',
  cores: os.cpus().length,
};

const history = [];
const events = [];
const lastAlert = {};
let latest = null;
let lastTest = 0;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/api/stats', (_req, res) => res.json(latest || {}));
app.get('/api/events', (_req, res) => res.json(events));
app.get('/api/services', (_req, res) => res.json(services));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(data);
}

// Events carry a code + params so the browser can translate them; msg is the English fallback
const MSG = {
  cpu_high: (p) => `CPU load ${p.v}% (limit ${p.limit}%)`,
  ram_high: (p) => `RAM usage ${p.v}% (limit ${p.limit}%)`,
  svc_down: (p) => `${p.name} is not responding`,
  svc_up: (p) => `${p.name} is back online`,
  test: () => 'Test alert: notification pipeline works',
};

function pushEvent(level, code, params = {}) {
  const e = { ts: Date.now(), level, code, params, msg: MSG[code](params) };
  events.push(e);
  if (events.length > 50) events.shift();
  console.log(`[${level}] ${e.msg}`);
  broadcast({ type: 'event', event: e });
  return e;
}

async function notify(e) {
  if (!cfg.webhook) return;
  try {
    await fetch(cfg.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: 'Watchtower alert',
          description: e.msg,
          color: e.level === 'crit' ? 0xef4444 : 0xf59e0b,
          timestamp: new Date(e.ts).toISOString(),
        }],
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
}

// A cooldown stops the same alert from firing over and over
function alert(key, level, code, params) {
  const now = Date.now();
  if (now - (lastAlert[key] || 0) < cfg.cooldown) return;
  lastAlert[key] = now;
  notify(pushEvent(level, code, params));
}

async function collect() {
  const [load, mem, time, net_] = await Promise.all([
    si.currentLoad(), si.mem(), si.time(), si.networkStats('*'),
  ]);
  const used = mem.active || mem.used;
  const sum = (k) => net_.reduce((a, i) => a + (i[k] || 0), 0);
  return {
    ts: Date.now(),
    cpu: +load.currentLoad.toFixed(1),
    ramPct: +((used / mem.total) * 100).toFixed(1),
    usedMem: +(used / GB).toFixed(2),
    totalMem: +(mem.total / GB).toFixed(2),
    uptime: Math.floor(time.uptime),
    rx: Math.round(sum('rx_sec')),
    tx: Math.round(sum('tx_sec')),
  };
}

let busy = false;
async function tick() {
  if (busy) return; // never start a new sample before the previous one finishes
  busy = true;
  try {
    latest = await collect();
    history.push(latest);
    if (history.length > 60) history.shift();
    broadcast({ type: 'stats', stats: latest });
    if (latest.cpu >= cfg.cpuLimit) alert('cpu', 'warn', 'cpu_high', { v: latest.cpu, limit: cfg.cpuLimit });
    if (latest.ramPct >= cfg.ramLimit) alert('ram', 'warn', 'ram_high', { v: latest.ramPct, limit: cfg.ramLimit });
  } catch (err) {
    console.error('Measurement error:', err.message);
  } finally {
    busy = false;
  }
}

const checkTcp = (host, port) => new Promise((resolve) => {
  const t = Date.now();
  const s = net.connect({ host, port: +port, timeout: 2000 });
  s.once('connect', () => { s.destroy(); resolve(Date.now() - t); });
  s.once('timeout', () => { s.destroy(); resolve(null); });
  s.once('error', () => resolve(null));
});

async function checkHttp(url) {
  const t = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return r.ok ? Date.now() - t : null;
  } catch { return null; }
}

async function checkServices() {
  await Promise.all(services.map(async (s) => {
    const [host, port] = s.type === 'tcp' ? s.target.split(':') : [];
    const latency = s.type === 'tcp' ? await checkTcp(host, port) : await checkHttp(s.target);
    const was = s.up;
    s.up = latency !== null;
    s.latency = latency;
    s.checkedAt = Date.now();
    if (was === true && !s.up) alert(`svc:${s.name}`, 'crit', 'svc_down', { name: s.name });
    if (was === false && s.up) pushEvent('ok', 'svc_up', { name: s.name });
  }));
  broadcast({ type: 'services', services });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', (err) => console.error('WebSocket error:', err.message));
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'test-alert' && Date.now() - lastTest > 5000) {
      lastTest = Date.now();
      notify(pushEvent('warn', 'test'));
    }
  });
  ws.send(JSON.stringify({
    type: 'hello', info, history, services, events,
    limits: { cpu: cfg.cpuLimit, ram: cfg.ramLimit },
    webhook: !!cfg.webhook,
  }));
  console.log(`Client connected (total: ${wss.clients.size})`);
});

// Drop dead connections
setInterval(() => {
  for (const c of wss.clients) {
    if (!c.isAlive) { c.terminate(); continue; }
    c.isAlive = false;
    c.ping();
  }
}, 30000);

// One shared loop: a single sample no matter how many clients are connected
setInterval(tick, cfg.interval);
setInterval(checkServices, 10000);
tick();
checkServices();

server.listen(cfg.port, cfg.host, () => console.log(`Watchtower running: http://localhost:${cfg.port} (listening on ${cfg.host})`));

process.on('SIGINT', () => {
  console.log('\nShutting down…');
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
});
