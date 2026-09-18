import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, ForumChannel, ThreadChannel } from 'discord.js';
import { getLocationById } from '../services/locations';
import {
  createThreadRecord,
  findThreadsFromPastDays,
  formatThreadTitle,
  isHotForRollover,
  markExpired,
  ThreadRow,
} from '../services/threads';
import { startOfNextEasternDay } from '../util/date';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

export function startExpireSweep(client: Client) {
  runSweep(client);
  setInterval(() => runSweep(client), SWEEP_INTERVAL_MS);
}

async function runSweep(client: Client) {
  const stale = findThreadsFromPastDays();
  for (const row of stale) {
    try {
      await expireOne(client, row);
    } catch (err) {
      console.error(`Failed to expire thread ${row.thread_id}:`, err);
      // Mark it expired anyway so a permanently broken thread doesn't get retried forever.
      markExpired(row.id);
    }
  }
}

async function expireOne(client: Client, row: ThreadRow) {
  const thread = await client.channels.fetch(row.thread_id).catch(() => null);
  if (!thread?.isThread()) {
    markExpired(row.id);
    return;
  }
  const threadChannel = thread as ThreadChannel;
  const forum = threadChannel.parent;
  const forumChannel = forum && forum.type === ChannelType.GuildForum ? (forum as ForumChannel) : null;

  const hot = isHotForRollover(row);
  const newThread = hot ? await rollOver(threadChannel, forumChannel, row) : null;

  await threadChannel
    .send(
      newThread
        ? `🌙 Rolling over to a new thread for today: ${newThread.url}`
        : '🌙 Thread closed for the day. If this location is still active, submit a new `/sighting`.'
    )
    .catch(() => {});

  if (forumChannel) {
    const expiredTag = forumChannel.availableTags.find((t) => t.name.toLowerCase() === 'expired');
    const activeTag = forumChannel.availableTags.find((t) => t.name.toLowerCase() === 'active');
    const remainingTags = threadChannel.appliedTags.filter((t) => t !== activeTag?.id);
    await threadChannel
      .setAppliedTags(expiredTag ? [...remainingTags, expiredTag.id] : remainingTags)
      .catch(() => {});
  }

  await threadChannel.setArchived(true).catch(() => {});
  markExpired(row.id);
}

/** Opens tomorrow's thread for a location whose thread was still active right up to midnight. */
async function rollOver(
  oldThread: ThreadChannel,
  forumChannel: ForumChannel | null,
  row: ThreadRow
): Promise<ThreadChannel | null> {
  if (!forumChannel) return null;
  const location = getLocationById(row.location_id);
  if (!location) return null;

  const lastMessage = await oldThread.messages.fetch({ limit: 1 }).then(
    (msgs) => msgs.first(),
    () => undefined
  );
  const carriedEmbeds = lastMessage?.embeds.map((e) => e.data) ?? [];

  const dayStart = startOfNextEasternDay(row.created_at);
  const activeTag = forumChannel.availableTags.find((t) => t.name.toLowerCase() === 'active');
  const clearButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('sighting-clear').setLabel('🚫 Mark as cleared').setStyle(ButtonStyle.Secondary)
  );

  const newThread = await forumChannel.threads.create({
    name: formatThreadTitle(location.label, dayStart),
    appliedTags: activeTag ? [activeTag.id] : [],
    message: {
      content: `↩️ Continuing from ${oldThread.url}`,
      embeds: carriedEmbeds,
      components: [clearButton],
    },
  });

  // Pin the new thread's throttle clock to this midnight rather than the old thread's actual
  // last ping — every hot rollover behaves the same way, next real ping eligible at 3 AM,
  // regardless of exactly when the triggering ping happened before midnight.
  createThreadRecord(row.guild_id, row.location_id, newThread.id, dayStart);

  return newThread;
}
