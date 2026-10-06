import { ChannelType, Client, ForumChannel } from 'discord.js';
import { listWalmartAlertsChannels } from '../services/config';
import {
  createDrawThreadRecord,
  findDrawThread,
  getSeenItemIds,
  markItemsSeen,
  WalmartSeenItem,
} from '../services/walmartWatch';
import { reportFailure } from '../util/failureAlerts';
import { drawThreadTitle } from '../util/walmartDraw';

const WALMART_URL = 'https://www.walmart.com/shop/collectibles/draw';
const POLL_INTERVAL_MS = 60 * 60 * 1000;

// How long to wait for config changes to settle before an immediate trigger actually runs —
// long enough that setting the channel and then the role a few seconds apart (the normal way
// to type two slash commands) collapses into one poll that sees both, rather than the channel
// trigger immediately posting everything pending with no role ping, leaving the role trigger
// with nothing left to post.
const TRIGGER_DEBOUNCE_MS = 15 * 1000;

// No DRAW_ELIGIBLE badge found on an item — rare, but still needs a stable grouping key.
const NO_DRAW_DATE_KEY = '__no_draw_date__';

// This page is server-rendered (confirmed by hand before building this): a plain fetch with a
// normal browser User-Agent returns the full product grid embedded in a __NEXT_DATA__ script
// tag, no headless browser needed. If Walmart starts blocking plain fetches or changes this
// page's structure, fetchDrawCarouselProducts throws and runPoll reports it rather than crashing.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const NEXT_DATA_PATTERN = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

interface RawProduct {
  id?: unknown;
  name?: unknown;
  brand?: unknown;
  canonicalUrl?: unknown;
  badges?: {
    groups?: {
      members?: { key?: unknown; slaText?: unknown }[];
    }[];
  };
}

export function startWalmartPoll(client: Client) {
  runPoll(client);
  setInterval(() => runPoll(client), POLL_INTERVAL_MS);
}

let pendingTrigger: NodeJS.Timeout | null = null;

/**
 * Requests a poll soon rather than waiting for the next hourly tick — meant for /config
 * set-walmart-channel and set-walmart-role to call right after a mod sets one up, so whatever's
 * currently pending posts right away instead of sitting for up to an hour. Debounced: calling
 * this again before the delay elapses (e.g. setting the channel, then the role moments later)
 * cancels the pending run and restarts the wait, so both config commands collapse into one poll
 * that sees whichever settings have landed by then — not two separate polls where the first one
 * posts everything before the second setting even exists. Fire-and-forget either way: runPoll
 * reports its own failures, and a config command's reply shouldn't be blocked on a live fetch.
 */
export function triggerWalmartPoll(client: Client): void {
  if (pendingTrigger) clearTimeout(pendingTrigger);
  pendingTrigger = setTimeout(() => {
    pendingTrigger = null;
    runPoll(client);
  }, TRIGGER_DEBOUNCE_MS);
}

async function runPoll(client: Client) {
  try {
    const rawProducts = await fetchDrawCarouselProducts();
    if (rawProducts.length === 0) {
      throw new Error('Walmart collectibles page returned zero products — page structure may have changed');
    }

    const pokemonItems = rawProducts
      .filter(isPokemonBranded)
      .map(toSeenItem)
      .filter((item): item is WalmartSeenItem => item !== null);

    const seenIds = getSeenItemIds();
    const newItems = pokemonItems.filter((item) => !seenIds.has(item.itemId));
    if (newItems.length === 0) return;

    const channels = listWalmartAlertsChannels();
    if (channels.length === 0) {
      // Nowhere to post yet (e.g. right after a fresh deploy, before /config
      // set-walmart-channel has been run) — leave these unseen rather than marking them,
      // so they're still picked up and posted once a channel is configured instead of being
      // silently consumed by whichever poll happens to run first.
      return;
    }

    const byDrawKey = new Map<string, WalmartSeenItem[]>();
    for (const item of newItems) {
      const group = byDrawKey.get(item.drawKey) ?? [];
      group.push(item);
      byDrawKey.set(item.drawKey, group);
    }

    for (const { guildId, channelId, roleId } of channels) {
      await postNewDrawItems(client, guildId, channelId, roleId, byDrawKey);
    }

    markItemsSeen(newItems);
  } catch (err) {
    await reportFailure(client, 'walmart-poll', err);
  }
}

async function postNewDrawItems(
  client: Client,
  guildId: string,
  channelId: string,
  roleId: string | undefined,
  byDrawKey: Map<string, WalmartSeenItem[]>,
): Promise<void> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildForum) {
    await reportFailure(
      client,
      'walmart-poll',
      new Error(`Configured Walmart channel ${channelId} for guild ${guildId} is missing or not a forum channel`),
    );
    return;
  }
  const forum = channel as ForumChannel;

  for (const [drawKey, items] of byDrawKey) {
    try {
      await postDrawGroup(forum, guildId, drawKey, items, roleId);
    } catch (err) {
      await reportFailure(client, 'walmart-poll', err);
    }
  }
}

/** Posts (or appends to) the one forum thread for this drawing. */
async function postDrawGroup(
  forum: ForumChannel,
  guildId: string,
  drawKey: string,
  items: WalmartSeenItem[],
  roleId: string | undefined,
): Promise<void> {
  const content = buildDrawMessage(items, roleId);
  const existing = findDrawThread(guildId, drawKey);

  if (existing) {
    const thread = await forum.threads.fetch(existing.thread_id).catch(() => null);
    if (thread) {
      await thread.send(content);
      return;
    }
    // Thread record exists but the actual thread is gone on Discord's side — fall through and
    // create a fresh one (createDrawThreadRecord upserts) rather than silently dropping the alert.
  }

  const thread = await forum.threads.create({
    name: drawKey === NO_DRAW_DATE_KEY ? 'Walmart Draw: date TBD' : drawThreadTitle(drawKey),
    message: { content },
  });
  createDrawThreadRecord(guildId, drawKey, thread.id);
}

/** No allowedMentions override — like sighting.ts's role ping, this is meant to notify, not be suppressed. */
function buildDrawMessage(items: WalmartSeenItem[], roleId: string | undefined): string {
  const lines = items.map((item) => `• ${item.title}`);
  const heading =
    items.length > 1 ? 'New Walmart collectibles drawing items' : 'New Walmart collectibles drawing item';
  const ping = roleId ? ` <@&${roleId}>` : '';
  return `🎟️${ping} **${heading}:**\n${lines.join('\n')}\n\nEnter here: ${WALMART_URL}`;
}

/**
 * Fetches the Walmart collectibles drawing page and pulls the product carousel's items out of
 * its server-rendered __NEXT_DATA__ JSON (props.pageProps.initialData.contentLayout.modules,
 * the module with type "PrismItemCarousel"). Every step here is defensive — Walmart owns this
 * page's shape, not us — so a structural surprise throws a clear error for reportFailure rather
 * than crashing the poll loop or silently returning nothing.
 */
async function fetchDrawCarouselProducts(): Promise<RawProduct[]> {
  const res = await fetch(WALMART_URL, {
    headers: {
      'User-Agent': BROWSER_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) {
    throw new Error(`Walmart page fetch failed: HTTP ${res.status}`);
  }

  const html = await res.text();
  const match = html.match(NEXT_DATA_PATTERN);
  if (!match) {
    throw new Error('Walmart page did not contain the expected __NEXT_DATA__ script tag');
  }

  const data = JSON.parse(match[1]);
  const modules = data?.props?.pageProps?.initialData?.contentLayout?.modules;
  if (!Array.isArray(modules)) {
    throw new Error('Walmart page JSON did not contain contentLayout.modules');
  }

  const products: RawProduct[] = [];
  const seenIds = new Set<string>();
  for (const mod of modules) {
    if (mod?.type !== 'PrismItemCarousel') continue;
    const moduleProducts = mod?.configs?.productsConfig?.products;
    if (!Array.isArray(moduleProducts)) continue;
    for (const product of moduleProducts) {
      const id = String(product?.id ?? '');
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      products.push(product);
    }
  }
  return products;
}

/** Strips accents and lowercases, so "Pokémon" and "pokemon" both match the same check. */
function normalizeAscii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function isPokemonBranded(product: RawProduct): boolean {
  const brand = typeof product.brand === 'string' ? product.brand : '';
  const name = typeof product.name === 'string' ? product.name : '';
  return normalizeAscii(brand).includes('pokemon') || normalizeAscii(name).includes('pokemon');
}

/** The "Drawing starts <date>" badge text, if this item has one. */
function extractDrawSlaText(product: RawProduct): string | undefined {
  const groups = product.badges?.groups;
  if (!Array.isArray(groups)) return undefined;
  for (const group of groups) {
    const members = group?.members;
    if (!Array.isArray(members)) continue;
    for (const member of members) {
      if (member?.key === 'DRAW_ELIGIBLE' && typeof member?.slaText === 'string' && member.slaText.trim()) {
        return member.slaText.trim();
      }
    }
  }
  return undefined;
}

function toAbsoluteUrl(canonicalUrl: unknown): string {
  const path = typeof canonicalUrl === 'string' ? canonicalUrl : '';
  if (!path) return WALMART_URL;
  return path.startsWith('http') ? path : `https://www.walmart.com${path}`;
}

/** Returns null (rather than throwing) for a malformed entry, so one bad item doesn't drop the whole poll. */
function toSeenItem(product: RawProduct): WalmartSeenItem | null {
  const itemId = String(product.id ?? '').trim();
  const title = typeof product.name === 'string' ? product.name.trim() : '';
  if (!itemId || !title) return null;

  return {
    itemId,
    title,
    url: toAbsoluteUrl(product.canonicalUrl),
    drawKey: extractDrawSlaText(product) ?? NO_DRAW_DATE_KEY,
  };
}
