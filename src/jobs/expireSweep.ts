import { ChannelType, Client, ForumChannel, ThreadChannel } from 'discord.js';
import { findStaleActiveThreads, markExpired } from '../services/threads';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

export function startExpireSweep(client: Client) {
  runSweep(client);
  setInterval(() => runSweep(client), SWEEP_INTERVAL_MS);
}

async function runSweep(client: Client) {
  const stale = findStaleActiveThreads();
  for (const row of stale) {
    try {
      const thread = await client.channels.fetch(row.thread_id).catch(() => null);
      if (thread?.isThread()) {
        const threadChannel = thread as ThreadChannel;
        await threadChannel
          .send('⏰ No updates in 24h — status unknown. If this location is still active, submit a new `/sighting`.')
          .catch(() => {});

        const forum = threadChannel.parent;
        if (forum && forum.type === ChannelType.GuildForum) {
          const forumChannel = forum as ForumChannel;
          const expiredTag = forumChannel.availableTags.find((t) => t.name.toLowerCase() === 'expired');
          const activeTag = forumChannel.availableTags.find((t) => t.name.toLowerCase() === 'active');
          const remainingTags = threadChannel.appliedTags.filter((t) => t !== activeTag?.id);
          await threadChannel
            .setAppliedTags(expiredTag ? [...remainingTags, expiredTag.id] : remainingTags)
            .catch(() => {});
        }

        await threadChannel.setArchived(true).catch(() => {});
      }
      markExpired(row.id);
    } catch (err) {
      console.error(`Failed to expire thread ${row.thread_id}:`, err);
      // Mark it expired anyway so a permanently broken thread doesn't get retried forever.
      markExpired(row.id);
    }
  }
}
