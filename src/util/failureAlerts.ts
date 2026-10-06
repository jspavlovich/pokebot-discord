import { ChannelType, Client, TextChannel } from "discord.js";
import { listFailureAlertsChannels } from "../services/config";

/**
 * Posts a short error notice to every guild's configured failure-alerts channel (if any),
 * so an unattended background job (Walmart poll, expire sweep, ...) going quietly wrong doesn't
 * stay invisible until someone happens to check the logs. Never throws — a failure to report a
 * failure should not take down the job that was reporting it; console.error is always the
 * fallback of last resort.
 */
export async function reportFailure(
  client: Client,
  source: string,
  error: unknown,
): Promise<void> {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[${source}]`, error);

  for (const { channelId } of listFailureAlertsChannels()) {
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) continue;
      await (channel as TextChannel).send(
        `⚠️ **${source}** failed: \`${detail.slice(0, 1800)}\``,
      );
    } catch (reportErr) {
      console.error(`Failed to post failure alert for ${source}:`, reportErr);
    }
  }
}
