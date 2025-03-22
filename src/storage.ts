import { Chat, ChatMember, Composer, Context, StorageAdapter, User } from "./deps.deno.ts";

export type ChatMembersFlavor<C extends Context> = C & {
  /**
   * Namespace of the `chat-members` plugin
   */
  chatMembers: {
    /**
     * Tries to obtain information about a member of a chat. If that information is already known,
     * no API calls are made.
     *
     * If the information is not yet known, calls `ctx.api.getChatMember`, saves the result to storage and returns it.
     *
     * @param chatId Chat in which to look for the  user
     * @param userId Id of the user to get information about
     * @returns Information about the status of the user on the given chat
     */
    getChatMember: (chatId?: string | number, userId?: number) => Promise<ChatMember>;
  };
};

export type ChatMembersOptions = {
  /**
   * Prevents deletion of members when
   * bot receives a LeftChatMember update
   */
  keepLeftChatMembers: boolean;
  /**
   * This option will install middleware to cache chat members without depending on the
   * `chat_member` event. For every update, the middleware checks if `ctx.chat` and `ctx.from` exist. If they both do, it
   * then proceeds to call `ctx.chatMembers.getChatMember` to add the chat member information to the storage in case it
   * doesn't exist.
   *
   * Enabling this automatically enables caching.
   *
   * Please note that, if you manually disable caching, the storage will be called for **every update**, which may be a lot, depending on how many
   * updates your bot receives. This also has the potential to impact the performance of your bot drastically. Only use this
   * if you _really_ know what you're doing and are ok with the risks and consequences.
   */
  enableAggressiveStorage: boolean;
  /**
   * Enables caching of chat members. This can be useful to avoid unnecessary API calls
   * when the same user is queried multiple times in a short period of time.
   *
   * Enabled by default when using aggressive storage.
   */
  enableCaching: boolean;
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
  getKey: (chatId: string | number, userId: number) => string;
};

function defaultKeyStrategy(chatId: string | number, userId: number) {
  return `${chatId}_${userId}`;
}

/**
 * Creates a middleware that keeps track of chat member updates
 *
 * **NOTE**: You need to manually enable `chat_members` update type for this to work
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
 * @param options Configuration options for the middleware
 * @returns A middleware that keeps track of chat member updates
 */
export function chatMembers<C extends Context>(
  adapter: StorageAdapter<ChatMember>,
  options: Partial<ChatMembersOptions> = {},
): Composer<ChatMembersFlavor<C>> {
  const {
    keepLeftChatMembers = false,
    enableAggressiveStorage = false,
    getKey = defaultKeyStrategy,
    enableCaching = enableAggressiveStorage,
  } = options;

  const cache = new Map<string, { timestamp: number; value: ChatMember }>();
  const composer = new Composer<ChatMembersFlavor<C>>();

  composer.use((ctx, next) => {
    ctx.chatMembers = {
      getChatMember: async (chatId = ctx.chat?.id ?? undefined, userId = ctx.from?.id ?? undefined) => {
        if (!userId) throw new Error("ctx.from is undefined and no userId was provided");
        if (!chatId) throw new Error("ctx.chat is undefined and no chatId was provided");

        const key = getKey(chatId, userId);

        const cachedChatMember = enableCaching ? cache.get(key) : undefined;
        if (cachedChatMember) return cachedChatMember.value;

        const dbChatMember = await adapter.read(key);

        if (dbChatMember) {
          if (enableCaching) cache.set(key, { timestamp: Date.now(), value: dbChatMember });
          return dbChatMember;
        }

        const chatMember = await ctx.api.getChatMember(chatId, userId);

        if (enableCaching) cache.set(key, { timestamp: Date.now(), value: chatMember });
        await adapter.write(key, chatMember);

        return chatMember;
      },
    };

    return next();
  });

  composer.on("chat_member", async (ctx, next) => {
    const key = getKey(ctx.chatMember.chat.id, ctx.chatMember.new_chat_member.user.id);
    const status = ctx.chatMember.new_chat_member.status;

    const DELETE_STATUS = ["left", "kicked"];

    if (DELETE_STATUS.includes(status) && !keepLeftChatMembers) {
      if (enableCaching) cache.delete(key);
      if (await adapter.read(key)) await adapter.delete(key);

      return next();
    }

    if (enableCaching) {
      cache.set(key, { timestamp: Date.now(), value: ctx.chatMember.new_chat_member });
    }
    await adapter.write(key, ctx.chatMember.new_chat_member);
    return next();
  });

  composer
    .filter(() => enableAggressiveStorage)
    .filter((ctx): ctx is ChatMembersFlavor<C> & { chat: Chat; from: User } => Boolean(ctx.chat) && Boolean(ctx.from))
    .use(async (ctx, next) => {
      await ctx.chatMembers.getChatMember();

      return next();
    });

  return composer;
}

export default { chatMembers };
