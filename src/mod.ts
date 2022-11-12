import type { ChatMember, ChatMemberUpdated, Context, StorageAdapter } from "./deps.deno.ts";
import { Composer } from "./deps.deno.ts";

export type ChatMembersOptions = {
  /**
   * Prevents deletion of members when
   * bot receives a LeftChatMember update
   */
  keepLeftChatMembers: boolean;
  /**
   * Function used to determine the key fo a given user and chat
   * The default implementation uses a combination of
   * chat and user ids in the format `chatId_userId`,
   * which will store a user as much times as they join chats.
   *
   * If you wish to store users only once, regardless of chat,
   * you can use a function that considers only the user id, like so:
   *
   * ```typescript
   * bot.use(chatMembers(adapter, { getKey: update => update.new_chat_member.user.id }}));
   * ```
   *
   * Keep in mind that, if you do that but don't set `keepLeftChatMembers` to `true`,
   * a user will be deleted from storage when they leave any chat, even if they're still a member of
   * another chat where the bot is present.
   */
  getKey: (update: ChatMemberUpdated) => string;
};

function defaultKeyStrategy(update: ChatMemberUpdated) {
  return `${update.chat.id}_${update.new_chat_member.user.id}`;
}

/**
 * Creates a middleware that keeps track of chat member updates
 *
 * **NOTE**: Youu need to manually enable `chat_members` update type for this to work
 *
 * Example usage:
 *
 * ```typescript
 * const bot = new Bot("<YOR_TELEGRAM_TOKEN>");
 * const adapter = new MemorySessionStorage();
 *
 * bot.use(chatMembers(adapter));
 *
 * bot.start({ allowed_updates: ["chat_member"] });
 * ```
 * @param adapter Storage adapter responsible for saving members information
 * @param options Cconfiguration options for the middleware
 * @returns A middleware that keeps track of chat member updates
 */
export function chatMembers(
  adapter: StorageAdapter<ChatMember>,
  options: Partial<ChatMembersOptions> = {},
): Composer<Context> {
  const { keepLeftChatMembers = false, getKey = defaultKeyStrategy } = options;

  const composer = new Composer();

  composer.on("chat_member", async (ctx, next) => {
    const key = getKey(ctx.chatMember);
    const status = ctx.chatMember.new_chat_member.status;

    const DELETE_STATUS = ["left", "kicked"];

    if (DELETE_STATUS.includes(status) && !keepLeftChatMembers) {
      if (await adapter.read(key)) await adapter.delete(key);

      return next();
    }

    await adapter.write(key, ctx.chatMember.new_chat_member);
    return next();
  });

  return composer;
}
