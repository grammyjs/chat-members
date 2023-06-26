import { Chat, ChatMember, ChatMemberUpdated, Composer, Context, Filter, FilterQuery, User } from "./deps.deno.ts";
import { MaybeAsyncIterable, StorageAdapter } from "./storage.ts";

type DeepPartial<T> = Partial<{ [k in keyof T]: DeepPartial<T[k]> }>;

export type ChatMembersSessionFlavor = Chat | User | ChatMember;

export type ChatMembersFlavor = {
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
     * @param userId ID of the user to get information about
     * @returns Information about the status of the user on the given chat
     */
    getChatMember: (
      chatId?: number,
      userId?: number,
    ) => Promise<ChatMember>;
    /**
     * Tries to obtain information about a user from the storage.
     *
     * The Bot API does not provide a `getUser` method, so it is not possible to obtain this information if it's not
     * cached from a previous update.
     *
     * @param userId Id of the user to look for
     * @returns Information about the user or `undefined` if user is not unknown
     */
    getUser: (userId?: number) => Promise<User | undefined>;
    /**
     * Tries to obtain information about a chat. If that information is already known, no API calls are made.
     *
     * If the information is not yet known, calls `ctx.api.getChat`, saves the result to storage and returns it.
     *
     * @param chatId ID of the chat to look for
     * @returns Information about the chat
     */
    getChat: (chatId?: number) => Promise<Chat>;
    getUserList: () => MaybeAsyncIterable<User>;
    getChatList: () => MaybeAsyncIterable<Chat>;
    /**
     * Reads the list of chat members from storage.
     *
     * Pass `chatId` if you only want the members of a specific chat.
     *
     * @param chatId Optional. ID of the chat to list members for
     * @returns The list of members from one or more chats
     */
    getChatMemberList: (chatId?: number) => MaybeAsyncIterable<ChatMember>;
  };
};

type ChatMembersContext = Context & ChatMembersFlavor;

export type ChatMembersOptions = {
  /**
   * This option will install middleware to cache chats, users and chat members without depending on the
   * `chat_member` event.
   *
   * For every update, the middleware checks if `ctx.chat` or `ctx.from` exist. If they do, it then proceeds to call
   * `ctx.chatMembers.getChatMember`, `ctx.chatMembers.getChat`, and `ctx.chatMembers.getUser` to add the information to
   * the storage in case it doesn't exist.
   *
   * Please note that this means the storage will be called for **every update**, which may be a lot, depending on how
   * many updates your bot receives.
   * This also has the potential to impact the performance of your bot drastically.
   * Only use this if you _really_ know what you're doing and are ok with the risks and consequences.
   */
  enableAggressiveStorage: boolean;
  removeLeft: {
    /**
     * Whether or not to delete information about chat members that left a chat.
     * Defaults to `true`.
     */
    chatMembers: boolean;
    /**
     * Whether or not to delete information about chats the bot leaves or is removed from.
     * Defaults to `true`.
     */
    chats: boolean;
  };
};

type CMFilter<T extends FilterQuery> = Filter<ChatMembersContext, T>;

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
export function chatMembers(
  adapter: StorageAdapter<ChatMembersSessionFlavor>,
  options: DeepPartial<ChatMembersOptions> = {},
): Composer<ChatMembersContext> {
  const {
    enableAggressiveStorage = false,
    removeLeft: {
      chatMembers: removeLeftChatMembers = true,
      chats: removeLeftChats = true,
    } = {},
  } = options;

  const isLeaving = (chatMember: ChatMemberUpdated) => ["left", "kicked"].includes(chatMember.new_chat_member.status);
  const chatId = (ctx: CMFilter<"chat_member"> | CMFilter<"my_chat_member">) => ctx.chat.id.toString();
  const userId = (chatMember: ChatMemberUpdated) => chatMember.new_chat_member.user.id.toString();

  async function writeIfNew(key: ["chats", string], value: Chat): Promise<void>;
  async function writeIfNew(key: ["users", string], value: User): Promise<void>;
  async function writeIfNew(key: ["chat_members", string, string], value: ChatMember): Promise<void>;
  async function writeIfNew(key: string[], value: any): Promise<void> {
    if (adapter.has(key)) return;

    await adapter.write(key, value);
  }

  const composer = new Composer<ChatMembersContext>();

  composer.use((ctx, next) => {
    ctx.chatMembers = {
      getChatMember: async (
        chatId = ctx.chat?.id ?? undefined,
        userId = ctx.from?.id ?? undefined,
      ) => {
        if (!userId) throw new Error("ctx.from is undefined and no userId was provided");
        if (!chatId) throw new Error("ctx.chat is undefined and no chatId was provided");

        const key = [
          "chat_members",
          chatId.toString(),
          userId.toString(),
        ];

        const cachedChatMember = await adapter.read(key) as ChatMember;
        if (cachedChatMember) return cachedChatMember;

        const chatMember = await ctx.api.getChatMember(chatId, userId);
        await adapter.write(key, chatMember);

        return chatMember;
      },
      getUser: async (userId = ctx.from?.id ?? undefined) => {
        if (!userId) throw new Error("ctx.from is undefined and no userId was provided");

        const key = ["users", userId.toString()];

        return adapter.read(key) as User | undefined;
      },
      getChat: async (chatId = ctx.chat?.id ?? undefined) => {
        if (!chatId) throw new Error("ctx.chat is undefined and no chatId was provided");

        const key = ["chats", chatId.toString()];

        const cachedChat = await adapter.read(key) as Chat;
        if (cachedChat) return cachedChat;

        const chat = await ctx.api.getChat(chatId);
        await adapter.write(key, chat);

        return chat;
      },
      getUserList: () => adapter.values<User>(["users"]),
      getChatList: () => adapter.values<Chat>(["chats"]),
      getChatMemberList: (chatId) =>
        adapter.values<ChatMember>(["chat_members", ...(chatId ? [chatId.toString()] : [])]),
    };

    return next();
  });

  composer.on("my_chat_member").branch(
    (ctx) => isLeaving(ctx.myChatMember),
    async (ctx, next) => {
      if (!removeLeftChats) return next();

      await adapter.delete(["chats", chatId(ctx)]);
      return next();
    },
    async (ctx, next) => {
      await adapter.write(["users", userId(ctx.myChatMember)], ctx.myChatMember.from);
      await adapter.write(["chats", chatId(ctx)], ctx.chat);
      return next();
    },
  );

  composer
    .on("chat_member")
    .branch(
      (ctx) => isLeaving(ctx.chatMember),
      async (ctx, next) => {
        if (!removeLeftChatMembers) return next();

        await adapter.delete(["chat_members", chatId(ctx), userId(ctx.chatMember)]);
        return next();
      },
      async (ctx, next) => {
        await Promise.all([
          await adapter.write(["users", userId(ctx.chatMember)], ctx.chatMember.new_chat_member.user),
          await adapter.write(["chats", chatId(ctx)], ctx.chat),
          await adapter.write(["chat_members", chatId(ctx), userId(ctx.chatMember)], ctx.chatMember.new_chat_member),
        ]);

        return next();
      },
    );

  composer
    .filter(() => enableAggressiveStorage)
    .use(async (ctx, next) => {
      if (ctx.chat && ctx.from && !ctx.hasChatType("private")) await ctx.chatMembers.getChatMember();
      if (ctx.chat) await writeIfNew(["chats", ctx.chat.id.toString()], ctx.chat);
      if (ctx.from) await writeIfNew(["users", ctx.from.id.toString()], ctx.from);

      return next();
    });

  return composer;
}

export default { chatMembers };
