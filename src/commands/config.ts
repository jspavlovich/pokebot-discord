import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  getNonSightingsChannelId,
  getSightingsChannelId,
  setNonSightingsChannelId,
  setSightingsChannelId,
} from "../services/config";

export const data = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Bot configuration")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("set-sightings-channel")
      .setDescription("Set the forum channel sightings post into")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("A forum channel")
          .addChannelTypes(ChannelType.GuildForum)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("set-non-sightings-channel")
      .setDescription("Set the forum channel non-sightings posts go into")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("A forum channel")
          .addChannelTypes(ChannelType.GuildForum)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("show").setDescription("Show current configuration"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const sub = interaction.options.getSubcommand();

  if (sub === "set-sightings-channel") {
    const channel = interaction.options.getChannel("channel", true);
    setSightingsChannelId(guildId, channel.id);
    await interaction.reply({
      content: `Sightings will now post to <#${channel.id}>.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === "set-non-sightings-channel") {
    const channel = interaction.options.getChannel("channel", true);
    setNonSightingsChannelId(guildId, channel.id);
    await interaction.reply({
      content: `Non-sightings will now post to <#${channel.id}>.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === "show") {
    const channelId = getSightingsChannelId(guildId);
    const nonSightingsChannelId = getNonSightingsChannelId(guildId);
    await interaction.reply({
      content: [
        channelId
          ? `Sightings channel: <#${channelId}>`
          : "Sightings channel not set yet.",
        nonSightingsChannelId
          ? `Non-sightings channel: <#${nonSightingsChannelId}>`
          : "Non-sightings channel not set yet.",
      ].join("\n"),
      ephemeral: true,
    });
  }
}
