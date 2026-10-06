import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  getFailureAlertsChannelId,
  getSightingsChannelId,
  getWalmartAlertsChannelId,
  getWalmartRoleId,
  setFailureAlertsChannelId,
  setSightingsChannelId,
  setWalmartAlertsChannelId,
  setWalmartRoleId,
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
      .setName("set-walmart-channel")
      .setDescription("Set the forum channel Walmart drawing alerts post into")
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
      .setName("set-walmart-role")
      .setDescription("Set the role pinged in Walmart drawing alert posts")
      .addRoleOption((o) =>
        o
          .setName("role")
          .setDescription("Role to ping")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("set-failure-channel")
      .setDescription("Set the channel background-job failures get reported to")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("A text channel")
          .addChannelTypes(ChannelType.GuildText)
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

  if (sub === "set-walmart-channel") {
    const channel = interaction.options.getChannel("channel", true);
    setWalmartAlertsChannelId(guildId, channel.id);
    await interaction.reply({
      content: `Walmart drawing alerts will now post to <#${channel.id}>.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === "set-walmart-role") {
    const role = interaction.options.getRole("role", true);
    setWalmartRoleId(guildId, role.id);
    await interaction.reply({
      content: `Walmart drawing alerts will now ping <@&${role.id}>.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === "set-failure-channel") {
    const channel = interaction.options.getChannel("channel", true);
    setFailureAlertsChannelId(guildId, channel.id);
    await interaction.reply({
      content: `Background-job failures will now be reported to <#${channel.id}>.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === "show") {
    const channelId = getSightingsChannelId(guildId);
    const walmartChannelId = getWalmartAlertsChannelId(guildId);
    const walmartRoleId = getWalmartRoleId(guildId);
    const failureChannelId = getFailureAlertsChannelId(guildId);
    await interaction.reply({
      content: [
        channelId
          ? `Sightings channel: <#${channelId}>`
          : "Sightings channel not set yet.",
        walmartChannelId
          ? `Walmart drawing alerts channel: <#${walmartChannelId}>`
          : "Walmart drawing alerts channel not set yet.",
        walmartRoleId
          ? `Walmart drawing alerts role: <@&${walmartRoleId}>`
          : "Walmart drawing alerts role not set yet.",
        failureChannelId
          ? `Failure alerts channel: <#${failureChannelId}>`
          : "Failure alerts channel not set yet.",
      ].join("\n"),
      ephemeral: true,
    });
  }
}
