# Chat Members Plugin For grammY

This plugin makes it easy to work with `ChatMember` objects, by offering a convenient way to listen for changes in the form of custom filters, and by storing and updating the objects.

## Usage

### Chat Member Filters

You can listen for two kinds of updates regarding chat members using a telegram bot: `chat_member` and `my_chat_member`, both of them specify the old and new status of the user.

- `my_chat_member` updates are received by your bot by default and they inform you about the status of the bot being updated in any chat, as well as users blocking the bot;
- `chat_member` updates are only received if you specifically include them in the list of allowed updates, they notify about any status changes for users in chats **where your bot is admin**.

Filters specify the status before and after the change, allowing you to react to every type of transition you're interested in.
Within the handler, types of `old_chat_member` and `new_chat_member` are updated accordingly.

```typescript
const bot = new Bot(process.env.BOT_TOKEN!);
const groups = bot.chatType(["group", "supergroup"]);

groups.filter(myChatMemberFilter("out", "regular"), async (ctx) => {
  await ctx.reply("Hello, thank you for adding me to the group!");
});

groups.filter(myChatMemberFilter("out", "admin"), async (ctx) => {
  await ctx.reply("Hello, thank you for adding me to the group as admin!");
});

groups.filter(myChatMemberFilter("regular", "admin"), async (ctx) => {
  await ctx.reply("I was promoted to admin!");
});

groups.filter(myChatMemberFilter("admin", "regular"), async (ctx) => {
  await ctx.reply("I am no longer admin");
});

groups.filter(chatMemberFilter("out", "in"), async (ctx) => {
  const user = ctx.chatMember.new_chat_member.user;
  await ctx.reply(
    `Welcome <b>${escapeHtml(user.first_name)}</> to the group!`,
    { parse_mode: "HTML" },
  );
});

bot.start({
  allowed_updates: [...API_CONSTANTS.DEFAULT_UPDATE_TYPES, "chat_member"],
  onStart: (me) => console.log("Listening to updates as", me.username),
});
```

Filters include the regular Telegram statuses (owner, administrator, member, restricted, left, kicked) and some additional ones for convenience:

- restricted_in: a member of the chat with restrictions;
- restricted_out: not a member of the chat, has restrictions;
- in: a member of the chat (administrator, creator, member, restricted_in);
- out: not a member of the chat (left, kicked, restricted_out);
- free: a member of the chat that isn't restricted (administrator, creator, member);
- admin: an admin of the chat (administrator, creator);
- regular: a non-admin member of the chat (member, restricted_in).

You can create your custom groupings of chat member types by passing an array instead of a string:

```typescript
groups.filter(
  chatMemberFilter(["restricted", "kicked"], ["free", "left"]),
  async (ctx) => {
    const from = ctx.from;
    const { status: oldStatus, user } = ctx.chatMember.old_chat_member;
    await ctx.reply(
      `<b>${escapeHtml(from.first_name)}</> lifted ` +
        `${oldStatus === "kicked" ? "ban" : "restrictions"} ` +
        `from <b>${escapeHtml(user.first_name)}</>`,
      { parse_mode: "HTML" },
    );
  },
);
```

#### Example Usage

The best way to use the filters is to pick a set of relevant statuses, for example 'out', 'regular' and 'admin', then make a table of the transitions between them:

| ↱           | Out         | Regular              | Admin               |
| ----------- | ----------- | -------------------- | ------------------- |
| **Out**     | ban-changed | join                 | join-and-promoted   |
| **Regular** | exit        | restrictions-changed | promoted            |
| **Admin**   | exit        | demoted              | permissions-changed |

Assign a listener to all the transitions that are relevant to your use-case.

Combine these filters with `bot.chatType` to only listen for transitions for a specific type of chat.
Add a middleware to listen to all updates as a way to perform common operations (like updating your database) before handing off control to a specific handler.

```typescript
const groups = bot.chatType(["group", "supergroup"]);

groups.on("chat_member", (ctx, next) => {
  // ran on all updates of type chat_member
  const {
    old_chat_member: { status: oldStatus },
    new_chat_member: { user, status },
    from,
    chat,
  } = ctx.chatMember;
  console.log(
    `In group ${chat.id} user ${from.id} changed status of ${user.id}:`,
    `${oldStatus} -> ${status}`,
  );

  // update database data here

  await next();
});

// specific handlers

groups.filter(chatMemberFilter("out", "in"), async (ctx, next) => {
  const { new_chat_member: { user } } = ctx.chatMember;
  await ctx.reply(`Welcome ${user.first_name}!`);
});
```

### Storing Chat Members

You can use a valid grammY [storage adapter](https://grammy.dev/plugins/session.html#known-storage-adapters) or an instance of any class that implements the [`StorageAdapter`](https://deno.land/x/grammy/mod.ts?s=StorageAdapter) interface.

```typescript
import { Bot, Context, MemorySessionStorage } from "grammy";
import type { ChatMember } from "@grammyjs/types";
import { chatMembers, ChatMembersFlavor } from "@grammyjs/chat-members";

type MyContext = Context & ChatMembersFlavor;

const adapter = new MemorySessionStorage<ChatMember>();

const bot = new Bot<MyContext>("<your bot token>");

bot.use(chatMembers(adapter));

bot.start({
  allowed_updates: ["chat_member", "message"],
  onStart: ({ username }) => console.log(`Listening as ${username}`),
});
```

### Reading Chat Member Info

This plugin also adds a new `ctx.chatMembers.getChatMember` function that will check the storage for information about a chat member before querying telegram for it.
If the chat member exists in the storage, it will be returned.
Otherwise, `ctx.api.getChatMember` will be called and the result will be saved to the storage, making subsequent calls faster and removing the need to call telegram again for that user and chat in the future.

Here's an example:

```typescript
bot.on("message", async (ctx) => {
  const chatMember = await ctx.chatMembers.getChatMember();

  await ctx.reply(`Hello, ${chatMember.user.first_name}! I see you are a ${chatMember.status} of this chat!`);
});
```

The second parameter, which is the chat id, is optional; if you don't provide it, `ctx.chat.id` will be used instead.
Please notice that, if you don't provide a chat id and there's no `chat` property inside the context (for example: on inline query updates), this will throw an error.

## Aggressive Storage

The `enableAggressiveStorage` config option will install middleware to cache chat members without depending on the `chat_member` event.
For every update, the middleware checks if `ctx.chat` and `ctx.from` exist.
If they both do, it then proceeds to call `ctx.chatMembers.getChatMember` to add the chat member information to the storage in case it doesn't exist.

Please note that this means the storage will be called for **every update**, which may be a lot, depending on how many updates your bot receives.
This also has the potential to impact the performance of your bot drastically.
Only use this if you _really_ know what you're doing and are ok with the risks and consequences.
