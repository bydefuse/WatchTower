# Watchtower

[English](README.md) | [Türkçe](README.tr.md)

A small dashboard that lets you watch your computer (or server) live from the browser. It shows CPU, RAM and network traffic in near real time, checks whether the services you care about are up, writes problems to an event log and, if you want, pings you on Discord.

<!-- Add a screenshot as docs/screenshot.png, then uncomment this line:
![Watchtower](docs/screenshot.png)
-->

## Why I built it

When you work with automation and bot systems you learn one thing quickly: a system that fails silently is worse than one that throws an error. This project is a small, self-contained version of that idea. Sampling, live delivery, service checks and alerting live in one Node.js app with very few dependencies.

## What it does

- **Live metrics:** CPU, RAM, download/upload speed and uptime, refreshed every 1.5 seconds by default.
- **Service checks:** probes HTTP URLs and TCP ports every 10 seconds, shows response time, and logs when a service goes down or comes back.
- **Alerts:** raised when CPU or RAM crosses a limit or a service stops responding. A cooldown (5 minutes by default) keeps the same alert from repeating.
- **Discord notifications (optional):** give it a webhook URL and alerts land in your channel. The "Test alert" button checks the pipeline.
- **Resilient connection:** if the server stops, the page reconnects on its own with growing delays. A freshly opened tab receives the last 60 samples, so charts never start empty.
- **Two languages:** English by default. Use the EN/TR switch in the top right to change it; the choice is remembered in your browser.
- **REST API:** `/health`, `/api/stats`, `/api/events`, `/api/services`.

## How it works

```
systeminformation ──> single sampling loop ──> WebSocket ──> browsers (Chart.js)
service checks ──────> alert engine ─────────> event log + Discord webhook
```

Instead of sampling once per client, the server runs one loop and pushes the result to everyone connected. The number of OS queries stays the same no matter how many tabs are open.

## Getting started

You need Node.js 20.12 or newer (`node -v` shows your version).

```bash
git clone https://github.com/bydefuse/watchtower.git
cd watchtower
npm install
npm start
```

Then open `http://localhost:3000`. No setup is required; to change settings, copy `.env.example` to `.env`.

> The UI loads Tailwind CSS and Chart.js from a CDN, so an internet connection is needed for the page to render properly.

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HOST` | `127.0.0.1` | Address to listen on. Use `0.0.0.0` for network access |
| `INTERVAL_MS` | `1500` | Sampling interval (ms) |
| `CPU_ALERT` | `90` | CPU alert threshold (%) |
| `RAM_ALERT` | `90` | RAM alert threshold (%) |
| `ALERT_COOLDOWN_SEC` | `300` | Time before the same alert can fire again |
| `DISCORD_WEBHOOK_URL` | empty | Webhook that receives alerts (messages are sent in English) |

### Services to watch

Add as many entries as you like to `services.json`:

```json
[
  { "name": "My website", "type": "http", "target": "https://example.com" },
  { "name": "MySQL", "type": "tcp", "target": "127.0.0.1:3306" }
]
```

An `http` service counts as online when it returns a successful status code; a `tcp` service when the port accepts a connection. The sample list includes Apache and MySQL from XAMPP. If they are not running on your machine they will show as offline, so edit the list to match your setup.

## WebSocket messages

| Message | When |
|---|---|
| `hello` | Once on connect: server info, recent samples, services, events |
| `stats` | On every sample |
| `services` | After every service check |
| `event` | When a new alert or event occurs |

A client can send `{"type":"test-alert"}` to try the notification pipeline.

## Troubleshooting

- **`Cannot GET /`:** `index.html` is not inside the `public` folder.
- **White page, faint text:** `public/style.css` or `public/app.js` is missing. Open `/style.css` and `/app.js` in the browser to check.
- **`EADDRINUSE`:** port 3000 is taken. Change `PORT` in `.env`.
- **Constant RAM alerts:** if your RAM really is nearly full, the alert is correct. Raise `RAM_ALERT` if it bothers you.

## Security note

The dashboard has no authentication and shows details about your machine (hostname, OS, service list). That is why it listens on `127.0.0.1` only by default. If you set `HOST=0.0.0.0`, do it on a network you trust and do not expose it directly to the internet. A Discord webhook URL is a secret: `.env` is in `.gitignore` so it stays out of the repo, but do not share it.

## Roadmap

- [ ] Disk usage and top processes
- [ ] Per-core CPU view
- [ ] Web Push and SMS notifications
- [ ] Password protection

## Author

**Zeix (Bydefuse)**: [portfolio](https://zeix-portfolio.netlify.app/) · [GitHub](https://github.com/bydefuse)

Released under the MIT license, see `LICENSE`.
