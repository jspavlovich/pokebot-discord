# pokebot-discord

A Discord bot for crowd-sourced restock sightings — replaces a free-text sightings channel
with a `/sighting` command that organizes reports into forum threads and pings the right role,
with room to grow into moderation, fun commands, and other integrations later.

## How sightings work

- `/sighting retailer:<autocomplete> location:<autocomplete> details:"text" photo:<optional>`
  looks up the location, finds or creates a forum thread for it, and pings the mapped role.
- If a thread for that location already exists and was created less than 24h ago, the new
  report is added as a reply instead of opening a duplicate. If it's been 3+ hours since the
  last ping in that thread, the role gets re-pinged; otherwise it's a quiet reply.
- Every thread's starter message has a **🚫 Mark as cleared** button anyone can click, which
  posts a notice and swaps the thread's forum tag to **Cleared**. A cleared thread is excluded
  from reuse, so a fresh report at that location later the same day opens a brand-new thread
  with a full ping instead of getting buried.
- A background sweep (every 15 minutes) finds threads still tagged **Active** whose 24h window
  has passed with no one confirming either way, posts a note, swaps the tag to **Expired**, and
  archives the thread.
- `/sighting-role add|list` and `/sighting-location add|remove|list` (mod-only, requires Manage
  Server) manage the role groups and retailer/location mappings — no code changes or redeploys
  needed to add more of either.
- `/config set-sightings-channel|show` (mod-only) points the bot at the forum channel to use.

## One-time Discord-side setup

1. Create a **Forum Channel** in your server for sightings (name it whatever you like).
2. In that channel's settings → **Tags**, add three tags: **Active**, **Cleared**, **Expired**.
   The bot looks these up by name — it does not create them for you (that would require an
   extra `Manage Channels` permission we intentionally didn't grant it).
3. Make sure the bot has access to that channel (it inherits server-wide permissions from its
   invite by default, but double check if the channel has custom overrides).

## Local setup

```bash
npm install
cp .env.example .env
# fill in DISCORD_TOKEN, CLIENT_ID, GUILD_ID in .env
npm run deploy-commands   # registers the slash commands with Discord
npm run dev               # runs the bot with live TypeScript execution
```

Once it's running in your server:

```
/sighting-role add label:"North Hills Area" role:@NorthHills-Alerts
/sighting-location add retailer:Target name:mcknight label:"McKnight" role:"North Hills Area"
/config set-sightings-channel channel:#restock-sightings
```

Repeat `/sighting-role add` and `/sighting-location add` for your other roles/locations, then
`/sighting` is ready to use.

## Deploying to Railway

1. Push this repo to GitHub, connect it to a new Railway project.
2. Add a **Volume**, mounted at `/app/data` (matches `DATABASE_PATH=./data/pokebot.sqlite` from
   the repo root, which Railway runs from `/app`).
3. Set the environment variables from `.env.example` in Railway's dashboard (never commit the
   real `.env`).
4. Railway auto-detects this as a Node project, runs `npm install` then `npm run build`
   (via the `build` script), and starts it with `npm start`.
5. After the first deploy, run `npm run deploy-commands` once from your local machine (pointed
   at the same `CLIENT_ID`/`GUILD_ID`/`DISCORD_TOKEN`) to register the slash commands — this
   only needs to be re-run when commands change, not on every deploy.
6. In Railway's workspace usage settings, consider setting a **soft** spending limit (email
   alert only) rather than a hard limit — a hard limit takes the bot fully offline until
   manually raised, which is worse for an always-on tool than an occasional extra dollar.

## Project layout

```
src/
  commands/       one file per slash command (data + execute + optional autocomplete)
  services/       SQLite-backed data access (config, roles, locations, threads)
  handlers/       routes interactions (commands, autocomplete, buttons) to the right code
  jobs/           the 24h thread-expiry background sweep
  db/             schema + connection setup
  config.ts       environment variable loading
  index.ts        bot entrypoint
  deploy-commands.ts   one-off script to register slash commands with Discord
```
