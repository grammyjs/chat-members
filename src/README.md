# Chat members plugin for grammY

This plugin watches for `chat_member` updates and stores a list of users, their statuses and permissions for each chat in which they and the bot are a member.

## Usage

You can use a valid grammY [storage adapter](https://grammy.dev/plugins/session.html#known-storage-adapters), or an instance of any class that implements the [`StorageAdapter`](https://deno.land/x/grammy/mod.ts?s=StorageAdapter) interface.

```typescript
import { Bot, MemorySessionStorage } from "https://deno.land/x/grammy@v1.12.0/mod.ts";
import { ChatMember } from "https://deno.land/x/grammy@v1.12.0/types.ts";
import { chatMembers } from "https://deno.land/x/grammy_chat_members/mod.ts";

const adapter = new MemorySessionStorage<ChatMember>();

const bot = new Bot("<your bot token>");

bot.use(chatMembers(adapter));

bot.start({
    allowed_updates: ["chat_member"],
    onStart: ({ username }) => console.log(`Listening as ${username}`),
});
```
