# Deploy Market Masters to Render

Market Masters is a single-process Node.js application backed by SQLite and WebSockets. **Use one Render web-service instance and attach a persistent disk.** Do not use a free/sleeping service or scale to multiple instances for a live class: the SQLite database and in-memory game connections are local to one instance.

## Recommended: deploy with the included Render Blueprint

1. Put the contents of this project folder in a GitHub repository. A private repository is recommended.
2. In Render, choose **New + → Blueprint** and connect that GitHub repository.
3. Render reads `render.yaml`. Review the service and persistent-disk plan, then apply it.
4. Wait for the first deployment to finish. The Blueprint pins Node.js to `22.22.1`, builds the frontend, starts the Express server, checks `/api/health`, and mounts a 1 GB persistent disk at `/data`.
5. Open your service URL followed by `/host`, for example `https://market-masters.onrender.com/host`.

The Blueprint sets:

- `DB_FILE=/data/market-masters.db` — keeps SQLite on the persistent disk.
- `TRUST_PROXY=1` — allows Express to recognise HTTPS and client IPs behind Render's proxy.
- `NODE_ENV=production` and `NODE_VERSION=22.22.1`.

The app derives its public join URL from the incoming HTTPS request, so you do not need to set `PUBLIC_URL` for a standard Render domain. If you use a custom domain, add it in Render and ensure HTTPS is active.

## Manual Render setup (alternative)

Create a **Web Service** from the GitHub repository and set:

| Setting | Value |
|---|---|
| Runtime | Node |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Instance | Paid instance with persistent-disk support |
| Instances | 1 |
| Disk mount path | `/data` |
| Disk size | 1 GB |

Environment variables:

| Key | Value |
|---|---|
| `NODE_VERSION` | `22.22.1` |
| `NODE_ENV` | `production` |
| `DB_FILE` | `/data/market-masters.db` |
| `TRUST_PROXY` | `1` |

## Verify the live deployment

1. Visit `https://YOUR-SERVICE.onrender.com/api/health`. Expected response: `{"ok":true}`.
2. Visit `/host`, create a practice game, and confirm the join URL uses your public HTTPS domain.
3. Join from a phone using mobile data. Confirm the teacher lobby updates when the student joins; this checks WebSockets through Render.
4. Have at least two students complete a short practice game, including a buy, a sell, a quiz answer, and the leaderboard.
5. Restart/redeploy the service and confirm the room still exists. Do not do this during a live class.

## Local development

Requires Node.js `22.22.1` (see `.node-version`).

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. The Vite development server proxies API and WebSocket traffic to the Node server on port `3001`.

To verify before pushing:

```bash
npm test
npm run build
```

GitHub Actions runs these same checks for pushes and pull requests.

## Data, backups, and scaling

- SQLite data is stored at `DB_FILE`. On Render, keep it under `/data` so it is on the persistent disk.
- Keep exactly one running service instance. Multiple instances would have separate local SQLite files and separate in-memory WebSocket/client state.
- Back up the database file when no game is actively writing to it. For a consistent SQLite backup, use SQLite's backup API or stop the service before copying the database; do not copy only the main `.db` file while WAL writes are active.
- Rooms inactive for 24 hours are purged by the application. The database is not a permanent student-record system.
- Use display names or nicknames rather than student legal names, and follow your school's privacy requirements.

## Important deployment note

The included Render configuration prepares the service, but a successful cloud deployment can only be confirmed after the repository is connected to your Render account. A local build/test run and a live Render health/WebSocket/persistence check are separate steps.
