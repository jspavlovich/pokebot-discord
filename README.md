# pokebot-discord

A Discord bot for crowd-sourced restock sightings — replaces a free-text sightings channel
with a `/sighting` command that organizes reports into forum threads and pings the right role,
with room to grow into moderation, fun commands, and other integrations later.

## How sightings work

- `/sighting retailer:<autocomplete> location:<autocomplete> details:"text" photo:<optional>`
  looks up the location, finds or creates a forum thread for it, and pings the mapped role.
- `/non-sightings retailer:<autocomplete> location:<autocomplete>` uses the sightings forum
  thread for that location, posts a no-stock update, and marks the thread **Cleared** without
  notifying a role. If there is no thread for the current day, it creates one already marked
  **Cleared**, also without a role notification.
- Sightings for the same location on the current Eastern calendar day are added to that thread.
  If it's been 3+ hours since the last ping, the role gets re-pinged; otherwise it's a quiet reply.
- Every thread's starter message has a **🚫 Mark as cleared** button anyone can click, which
  posts a notice and swaps the thread's forum tag to **Cleared**. A later sighting the same day
  reopens the thread and follows the normal role ping throttle.
- A background sweep (every 15 minutes) finds threads still tagged **Active** whose 24h window
  has passed with no one confirming either way, posts a note, swaps the tag to **Expired**, and
  archives the thread.
- If someone reports a retailer/location combo that isn't in the catalog yet, the bot doesn't
  block the report — it still posts a thread, tagged **Unmatched**, with the raw retailer/location
  text in an embed. It won't ping anyone, dedupe, or expire on its own since there's no location
  record backing it; a mod adds the location with `/sighting-location add` and re-tags the thread
  to bring it into the normal flow.
- `/sighting-role add|list` (mod-only) manages the role groups sightings can ping.
- `/sighting-retailer add|remove|list` (mod-only) manages the catalog of retailers (Target,
  Best Buy, ...) — a plain list, no role attached.
- `/sighting-neighborhood add|remove|list` (mod-only) manages the catalog of neighborhoods
  (McKnight, Cranberry, ...), each one mapped to exactly one role group.
- `/sighting-location add|remove|list` (mod-only) combines a retailer + neighborhood into an
  actual reportable location, e.g. Target + McKnight. Since retailer and neighborhood are both
  picked from their catalogs (autocomplete, not free text), there's no way for spelling to drift
  across entries — "Target" can never end up stored two different ways. The display label
  defaults to `"Neighborhood - Retailer"` (e.g. "McKnight - Target") but can be overridden per
  location if you want something more specific.
- None of the above ever needs a code change or redeploy — it's all live admin commands.
- `/config set-sightings-channel|show` (mod-only) points the bot at the forum channel to use.

## Walmart collectibles drawing alerts

- A background poll (every 15 minutes) checks Walmart's collectibles drawing page
  (`walmart.com/shop/collectibles/draw`) for new Pokémon TCG items and posts about them —
  same "poll an interval, diff against known state" shape as the thread-expiry sweep, but
  watching a retailer page instead of our own thread state.
- Items are grouped by their drawing's start time. Each distinct drawing gets one forum thread
  in the configured channel, titled `Walmart Draw <MM/DD> <H AM/PM> <timezone>` (converted to
  Eastern); every new item found for a drawing that already has a thread gets posted as a reply
  in it rather than a new thread. The thread body is just a bullet list of item names plus a
  link to the drawing page — entries aren't purchasable individually, you enter the drawing from
  that one page.
- First deploy baselines whatever's currently listed as "already seen" without posting, so
  turning this on doesn't flood the channel with every item already on the page.
- `/config set-walmart-channel|show` (mod-only) points the bot at the forum channel to post
  drawing alerts into (an existing forum channel — the bot doesn't create or tag it).

## Background-job failure alerts

- Anything a background job catches (a failed Walmart poll, a thread the expire sweep couldn't
  close out, ...) gets reported to a configured channel, not just the process logs — so trouble
  with an unattended job doesn't stay invisible until someone happens to check.
- `/config set-failure-channel|show` (mod-only) points the bot at the text channel to report to.
  Optional — if unset, failures still get logged to the console, just not to Discord.

## One-time Discord-side setup

1. Create a **Forum Channel** in your server for sightings (name it whatever you like).
2. In that channel's settings → **Tags**, add four tags: **Active**, **Cleared**, **Expired**,
   **Unmatched**. The bot looks these up by name — it does not create them for you (that would
   require an extra `Manage Channels` permission we intentionally didn't grant it).
3. Make sure the bot has access to that channel (it inherits server-wide permissions from its
   invite by default, but double check if the channel has custom overrides).
4. For Walmart drawing alerts, make sure the bot has access to your Walmart-drawings forum
   channel (no required tags — the bot just posts into it). Optionally, pick a text channel for
   background-job failure alerts too.

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
/sighting-retailer add name:Target
/sighting-neighborhood add name:McKnight role:"North Hills Area"
/sighting-location add retailer:Target neighborhood:McKnight
/config set-sightings-channel channel:#restock-sightings
```

Repeat for your other roles/retailers/neighborhoods/locations, then `/sighting` is ready to use.
For loading a lot of these at once instead of one-by-one, see the seeding section below.

## Bulk seeding

Instead of running admin commands one at a time, edit a JSON file and load it all at once:

```bash
cp seed-data.example.json seed-data.json
# edit seed-data.json with your real roles/retailers/neighborhoods/locations
npm run seed
```

`seed-data.json` looks like:

```json
{
  "roles": [{ "label": "North Hills Area", "roleId": "1234..." }],
  "retailers": ["Target", "Best Buy"],
  "neighborhoods": [{ "name": "McKnight", "role": "North Hills Area" }],
  "locations": [
    { "retailer": "Target", "neighborhood": "McKnight" },
    {
      "retailer": "Best Buy",
      "neighborhood": "McKnight",
      "label": "McKnight (custom label)"
    }
  ]
}
```

It's an **upsert** — safe to edit and re-run anytime: new entries get added, changed
labels/roles get updated, nothing gets duplicated. Locations missing a role/retailer/neighborhood
get skipped with a warning rather than failing the whole run. `seed-data.json` itself is
git-ignored (it may contain real role IDs specific to your server); `seed-data.example.json` is
the tracked template.

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
  services/       SQLite-backed data access (config, roles, retailers, neighborhoods, locations, threads, walmartWatch)
  handlers/       routes interactions (commands, autocomplete, buttons) to the right code
  jobs/           the 24h thread-expiry sweep and the Walmart collectibles drawing poll
  util/           Eastern-time helpers, Walmart draw-title parsing, failure-alert reporting
  db/             schema + connection setup
  config.ts       environment variable loading
  index.ts        bot entrypoint
  deploy-commands.ts   one-off script to register slash commands with Discord
```
