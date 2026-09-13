import { ButtonInteraction, ChannelType, ForumChannel, ThreadChannel } from 'discord.js';
import { getThreadByThreadId, markCleared } from '../services/threads';

export async function handleClearButton(interaction: ButtonInteraction) {
  const record = getThreadByThreadId(interaction.channelId);
  if (!record) {
    await interaction.reply({ content: 'Could not find a sighting record for this thread.', ephemeral: true });
    return;
  }

  markCleared(record.id);

  const thread = interaction.channel as ThreadChannel;
  const forum = thread.parent;
  if (forum && forum.type === ChannelType.GuildForum) {
    const forumChannel = forum as ForumChannel;
    const clearedTag = forumChannel.availableTags.find((t) => t.name.toLowerCase() === 'cleared');
    const activeTag = forumChannel.availableTags.find((t) => t.name.toLowerCase() === 'active');
    const remainingTags = thread.appliedTags.filter((t) => t !== activeTag?.id);
    await thread
      .setAppliedTags(clearedTag ? [...remainingTags, clearedTag.id] : remainingTags)
      .catch(() => {});
  }

  await interaction.reply({ content: `🚫 Marked as cleared by ${interaction.user}.` });
}
