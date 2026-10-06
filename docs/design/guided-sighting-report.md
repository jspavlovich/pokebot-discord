# Guided sighting report via button + chained modals (design doc, not yet implemented)

## Problem

`/sighting` and `/non-sightings` work well, but both require typing a slash
command name and knowing its options. Some members would rather click a
button and fill out a short form. This adds that as an additional entry
point — the existing slash commands (with real autocomplete) stay exactly as
they are for anyone who prefers them.

## Flow

1. A mod runs a new `/sighting-post` command in whatever channel they want it
   to live in. It posts an embed explaining the feature, with two buttons:
   **Report Sighting** and **Report No Stock**.
2. Click either button → **Modal 1**: a single Retailer select menu
   (populated from `listRetailersInUse`).
3. Submit → chains directly to **Modal 2** (a `ModalSubmitInteraction` can
   itself respond with another modal, same as a button can):
   - Sighting flow: Location select (from `listLocations`, filtered to the
     chosen retailer) + a paragraph text field for Details.
   - No Stock flow: Location select only, no text field.
4. Submit → resolves the retailer/location pair and runs the same
   thread-creation logic `/sighting` and `/non-sightings` already have.

## Discord API constraints this design works within

Confirmed against the installed `discord.js@14.27.0` / `@discordjs/builders@1.14.1`
/ `discord-api-types` (v10) typings:

- **25 options per select menu**, hard API limit
  (`discord-api-types/payloads/v10/message.d.ts`: "Specified choices in a
  select menu; max 25"). No pagination or search for a custom string select —
  that live-search behavior only exists for the built-in User/Role/Channel
  selects, which pull from Discord's own directories, not an arbitrary list.
- **5 top-level components per modal**, hard API limit
  (`APIModalInteractionResponseCallbackData`: "Between 1 and 5 (inclusive)
  components"). A `LabelBuilder` wraps exactly one input (select, text input,
  checkbox, checkbox group, radio group, or file upload) — there's no way to
  nest multiple fields under one top-level slot to get around this.
- **No autocomplete in modals.** Autocomplete is exclusively a slash-command
  option feature (`isAutocomplete()` interactions); `APITextInputComponent`
  has no field for live suggestions. This is why the guided flow uses select
  menus instead of free-text fields for retailer/location.
- **Modals can chain.** `ModalSubmitInteraction` has `showModal()` applied to
  it (`discord.js/src/structures/interfaces/InteractionResponses.js`), so
  responding to a modal submission with another modal is a normal interaction
  response (type 9), not a special case. Each hop is bound by the same
  3-second response window as any interaction, and `showModal()` must be the
  *immediate* response — no defer-then-modal. Whatever Modal 2 needs (e.g.
  the retailer-filtered location list) has to be fetched synchronously before
  calling `showModal()`; `better-sqlite3` is local and synchronous, so this
  isn't a real latency concern here.
- **No offline renderer.** Modals only render inside the real Discord client.
  "Local" testing means a dev bot + a private test guild, not a simulator —
  this repo already supports that via `GUILD_ID` (instant guild-scoped
  command deploys) and an overridable `DATABASE_PATH`, both in `src/config.ts`.

## Why the "unmatched sighting" fallback doesn't apply here

`listRetailersInUse()` only returns retailers that already have at least one
location on file (see its comment in `src/services/locations.ts`: "Retailers
that actually have at least one location combo"). Since Modal 2's Location
select is always populated per-retailer via `listLocations(guildId,
retailer)`, every retailer/location combo offered through this flow is
guaranteed to exist — the unmatched-thread fallback (free-typed values that
don't match anything) stays reachable only through `/sighting`'s own
autocomplete-but-still-typed option path, unchanged.

**25-cap scaling, if it's ever needed:** a single retailer's location count
passing 25 can be handled by splitting Modal 2's Location field into two
select menus (e.g. alphabetic split) — modal budget allows it (2 Location
selects + 1 Details = 3 of 5 slots, Retailer lives in its own modal). If
Retailer *and* Location both need splitting at the same time, the 5-slot
budget runs out; at that point fall back to a three-modal chain (Retailer →
Location → Details) since each chained modal gets its own fresh 5-slot
budget. Not needed for v1 — current data is empty.

## Shared logic refactor

- `src/commands/sighting.ts`: extract the body of `execute()` from the
  location lookup through thread creation (today's lines ~71–174) into an
  exported `reportSighting(interaction, guildId, guild, retailer,
  neighborhoodName, details, photo?)`. `execute()` keeps the guild check +
  option parsing, then calls it with the `photo` attachment. The modal flow
  calls it with `photo` omitted — it has no attachment input.
- `src/commands/non-sightings.ts`: same shape, extract into
  `reportNonSighting(interaction, guildId, guild, retailer,
  neighborhoodName)`.
- Both take `interaction` typed as discord.js's `RepliableInteraction` (a
  union covering both `ChatInputCommandInteraction` and
  `ModalSubmitInteraction` — both support `.reply`/`.deferReply`/`.editReply`),
  so the same function serves the slash command and the modal handler.

## Commands

- New file `src/commands/sighting-post.ts` — mod-only
  (`.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)`), posts
  the embed + two buttons to whatever channel it's run in. Not the sightings
  forum itself — forum channels only accept new threads, not plain messages —
  so a mod would run this in a regular text channel (e.g. an instructions
  channel).
- Registered in `src/commands/index.ts` alongside the existing `sighting*`
  commands.

## Interaction handling

`customId` scheme:

- Post buttons: `report-start:sighting`, `report-start:nonsighting`.
- Modal 1 (Retailer): `report-retailer:<flow>`. Field customId: `retailer`
  (string select).
- Modal 2 (Location [+ Details]): `report-details:<flow>:<retailer>`,
  parsed with a 2-part split limit so a retailer name containing `:` still
  round-trips. Field customIds: `location` (string select), `details`
  (paragraph text, sighting flow only).

New file `src/handlers/reportFlow.ts`:

- `handleReportStartButton(interaction: ButtonInteraction)` — shows Modal 1.
- `handleRetailerModalSubmit(interaction: ModalSubmitInteraction)` — reads
  flow + retailer from the select, builds and shows Modal 2.
- `handleReportDetailsModalSubmit(interaction: ModalSubmitInteraction)` —
  reads flow/retailer from `customId` and location (+ details) from the
  fields, calls `reportSighting` or `reportNonSighting`.

`src/handlers/interactionCreate.ts` additions:

- `interaction.isButton() && interaction.customId.startsWith('report-start:')`
  → `handleReportStartButton`.
- A new `interaction.isModalSubmit()` branch (none exists today — only
  chat-input, autocomplete, and button branches) → dispatch on
  `customId.startsWith('report-retailer:')` / `'report-details:'`.

## Open questions to settle before implementing

- Should `/sighting-post` be free to run in any channel, or should it
  require/default to a configured "instructions" channel? Leaning toward any
  channel — simplest, and matches how the reference screenshot's post just
  lives wherever it was pinned.
- Should `/sighting-post` be re-run-to-update, or always post a fresh
  message? Simplest v1: always posts new; a mod deletes the stale one
  manually if they re-run it.
- Longer term: Discord's newer modal file-upload component
  (`APIFileUploadComponent`, part of the same Components V2 `Label` system
  this design already relies on) could let the guided flow attach a photo
  too. Worth revisiting once the base flow ships — not in scope for v1.

## Rough build order

1. Extract `reportSighting` / `reportNonSighting` out of the two existing
   commands — no behavior change, slash commands keep working as-is.
2. Add `handlers/reportFlow.ts` with the button + two modal-submit handlers.
3. Wire the new button/modal routing into `interactionCreate.ts` (add the
   `isModalSubmit()` branch).
4. Add `/sighting-post` command + register it in `src/commands/index.ts`.
5. Manually test end-to-end against a dev guild/dev DB for both flows
   (sighting with details, no-stock without), including a retailer with
   multiple locations to confirm the filtered Location select works.
