import { assertEquals } from "https://deno.land/std@0.195.0/assert/assert_equals.ts";
import { assertExists } from "https://deno.land/std@0.195.0/assert/mod.ts";
import { afterEach, beforeEach, describe, it } from "https://deno.land/std@0.195.0/testing/bdd.ts";
import { assertSpyCalls, spy } from "https://deno.land/std@0.195.0/testing/mock.ts";
import { Methods } from "https://deno.land/x/grammy@v1.21.1/core/client.ts";
import { Bot, Context, MiddlewareFn, RawApi } from "https://deno.land/x/grammy@v1.21.1/mod.ts";
import { Update } from "https://deno.land/x/grammy_types@v3.1.2/update.ts";
import { ChatMembersFlavor, ChatMembersOptions, ChatMembersSessionFlavor, chatMembers } from "./mod.ts";
import { CascadingKey, KV, Key, MaybeAsyncIterable, MaybePromise, StorageAdapter } from "./storage.ts";
import { DeepPartial } from "./types.ts";

const getChatFixture = {
  ok: true as const,
  result: {
    id: 1234,
    first_name: "Dummy",
    username: "dummyuser",
    type: "private",
    active_usernames: [
      "dummyuser",
    ],
    bio: "",
    has_private_forwards: true,
    has_restricted_voice_and_video_messages: true,
    photo: {
      small_file_id: "dummy",
      small_file_unique_id: "dummy",
      big_file_id: "dummy",
      big_file_unique_id: "dummy",
    },
    message_auto_delete_time: 0,
  },
};

const getChatMemberFixture = {
  ok: true as const,
  result: {
    user: {
      id: 16715013,
      is_bot: false,
      first_name: "Roz",
      username: "roziscoding",
      language_code: "en",
      is_premium: true,
    },
    status: "administrator",
    can_be_edited: false,
    can_manage_chat: true,
    can_change_info: true,
    can_delete_messages: true,
    can_invite_users: true,
    can_restrict_members: true,
    can_pin_messages: true,
    can_manage_topics: false,
    can_promote_members: true,
    can_manage_video_chats: true,
    is_anonymous: false,
    can_manage_voice_chats: true,
  },
};

const keyMatchesPrefix = (key: Key, prefix?: Key): boolean => {
  if (!prefix) return true;
  if (typeof key !== typeof prefix) return false;
  if (typeof key === "string" && typeof prefix === "string") return key.startsWith(prefix);
  if (Array.isArray(key) && Array.isArray(prefix) && key.length >= prefix.length) {
    let match = true;
    for (let i = 0; i < prefix.length; i++) {
      if (key[i] !== prefix[i]) {
        match = false;
        break;
      }
    }
    return match;
  }
  return false;
};

export class TestAdapter implements StorageAdapter<ChatMembersSessionFlavor> {
  private storage = new Map<string, ChatMembersSessionFlavor>();

  read(key: Key): MaybePromise<ChatMembersSessionFlavor | undefined> {
    return this.storage.get(JSON.stringify(key));
  }

  write(key: Key, value: ChatMembersSessionFlavor): MaybePromise<void> {
    this.storage.set(JSON.stringify(key), value);
  }

  delete(key: Key): MaybePromise<void> {
    this.storage.delete(JSON.stringify(key));
  }
  has(key: Key): MaybePromise<boolean> {
    return this.storage.has(JSON.stringify(key));
  }
  *keys(prefix?: Key | undefined): MaybeAsyncIterable<CascadingKey> {
    for (const key of this.storage.keys()) {
      const parsedKey = JSON.parse(key);
      if (!prefix) yield parsedKey;

      if (prefix && keyMatchesPrefix(parsedKey, prefix)) yield parsedKey;

      continue;
    }
  }
  *values<V extends ChatMembersSessionFlavor = ChatMembersSessionFlavor>(prefix?: Key) {
    for (const [key, value] of this.storage.entries()) {
      const parsedKey: Key = JSON.parse(key);

      if (keyMatchesPrefix(parsedKey, prefix)) yield value as V;

      continue;
    }
  }
  *entries(prefix?: Key | undefined): MaybeAsyncIterable<KV<ChatMembersSessionFlavor>> {
    for (const [key, value] of this.storage.entries()) {
      const parsedKey: Key = JSON.parse(key);
      if (keyMatchesPrefix(parsedKey, prefix)) yield [parsedKey, value];
    }
  }

  clear() {
    this.storage.clear();
  }

  toJSON() {
    return JSON.stringify([...this.storage.entries()]);
  }
}

type ChatMembersContext = Context & ChatMembersFlavor;
type ChatMembersMiddleware = MiddlewareFn<ChatMembersContext>;

const adapter = new TestAdapter();

function getBotInstance(options?: DeepPartial<ChatMembersOptions>) {
  const bot = new Bot<ChatMembersContext>("dummy token", {
    botInfo: {
      id: 1,
      can_join_groups: true,
      can_read_all_group_messages: false,
      first_name: "dummy",
      is_bot: true,
      supports_inline_queries: false,
      username: "dummybot",
    },
  });

  bot.use(chatMembers(adapter, options));

  const isInterceptedMethod = (method: Methods<RawApi>): method is "getChatMember" | "getChat" => {
    if (["getChatMember", "getChat"].includes(method)) return true;
    return false;
  };

  bot.api.config.use((prev, method, payload) => {
    if (isInterceptedMethod(method)) {
      if (method === "getChat") return Promise.resolve(getChatFixture as any);
      return Promise.resolve(getChatMemberFixture as any);
    }

    return prev(method, payload);
  });

  return bot;
}

interface AssertWithUpdateOptions {
  update: Update;
  options?: DeepPartial<ChatMembersOptions>;
}

const assertWithUpdate = async (
  { update, options }: AssertWithUpdateOptions,
  ...middleware: ChatMembersMiddleware[]
) => {
  const spiedMiddleware = middleware.map((m) => spy(m));
  const bot = getBotInstance(options);

  bot.use(...spiedMiddleware);

  await bot.handleUpdate(update);

  for (const m of spiedMiddleware) assertSpyCalls(m, 1);
};

describe("Chat members plugin", () => {
  afterEach(() => {
    adapter.clear();
  });

  describe("chatMembers middleware", () => {
    it("adds chatMembers namespace to context", async () => {
      const update = {
        update_id: 1,
        message: {
          message_id: 1,
          date: 1,
          chat: {
            id: 1,
            type: "private",
          },
          text: "dummy",
        },
      } as Update;

      await assertWithUpdate({ update }, (ctx) => {
        assertExists(ctx.chatMembers);
        assertExists(ctx.chatMembers.getChat);
        assertExists(ctx.chatMembers.getChatList);
        assertExists(ctx.chatMembers.getChatMember);
        assertExists(ctx.chatMembers.getChatMemberList);
        assertExists(ctx.chatMembers.getUser);
        assertExists(ctx.chatMembers.getUserList);
      });
    });
  });

  describe("when bot is added to a group", () => {
    const update: Update = {
      update_id: 562795581,
      my_chat_member: {
        chat: {
          id: -1,
          title: "Dummy group",
          type: "supergroup",
        },
        from: {
          id: 1,
          is_bot: false,
          first_name: "Dummy user",
          username: "dumyuser",
          language_code: "en",
          is_premium: true,
        },
        date: 1689863911,
        old_chat_member: {
          user: {
            id: 2,
            is_bot: true,
            first_name: "Dummy Bot",
            username: "dummybot",
          },
          status: "left",
        },
        new_chat_member: {
          user: {
            id: 2,
            is_bot: true,
            first_name: "Dummy Bot",
            username: "dummybot",
          },
          status: "member",
        },
      },
    };

    it("saves the chat to storage", async () => {
      await assertWithUpdate({ update }, () => {
        assertExists(adapter.read(["chats", "-1"]), adapter.toJSON());
      });
    });
  });

  describe("when bot is removed from a group", () => {
    beforeEach(() => {
      adapter.write(["chats", "-1"], update.my_chat_member!.chat);
    });

    const update: Update = {
      update_id: 562795581,
      my_chat_member: {
        chat: {
          id: -1,
          title: "Dummy group",
          type: "supergroup",
        },
        from: {
          id: 1,
          is_bot: false,
          first_name: "Dummy user",
          username: "dumyuser",
          language_code: "en",
          is_premium: true,
        },
        date: 1689863911,
        old_chat_member: {
          user: {
            id: 2,
            is_bot: true,
            first_name: "Dummy Bot",
            username: "dummybot",
          },
          status: "member",
        },
        new_chat_member: {
          user: {
            id: 2,
            is_bot: true,
            first_name: "Dummy Bot",
            username: "dummybot",
          },
          status: "left",
        },
      },
    };

    describe("when removeLeftChats is false", () => {
      it("does not remove the chat from storage", async () => {
        await assertWithUpdate({ update, options: { removeLeft: { chats: false } } }, () => {
          assertExists(adapter.read(["chats", "-1"]), adapter.toJSON());
        });
      });
    });

    describe("when removeLeftChats is true", () => {
      it("removes the chat from storage", async () => {
        await assertWithUpdate({ update }, () => {
          assertEquals(adapter.read(["chats", "-1"]), undefined, adapter.toJSON());
        });
      });
    });
  });

  describe("when a user joins a group", () => {
  });
});
