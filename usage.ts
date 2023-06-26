/* ======================================= Remove this file before v2 release ======================================= */

import { API_CONSTANTS, Bot, Context } from "https://lib.deno.dev/x/grammy@v1/mod.ts";
import { chatMembers, ChatMembersFlavor, ChatMembersSessionFlavor } from "./src/mod.ts";
import { MaybeAsyncIterable, MemorySessionStorage } from "./src/storage.ts";

const consume = async <T>(itr: MaybeAsyncIterable<T>) => {
  const arr = [];

  for await (const item of itr) {
    arr.push(item);
  }

  return arr;
};

type MyContext = Context & ChatMembersFlavor;

const bot = new Bot<MyContext>("298746736:AAFPI0dkCVA5ieeRQaA78WO4x5vLf5Te3Vc");

const adapter = new MemorySessionStorage<ChatMembersSessionFlavor>();
bot.use(chatMembers(adapter, { enableAggressiveStorage: true }));

bot.use(async (ctx) => {
  console.log(await consume(ctx.chatMembers.getChatList()));
  console.log(await consume(ctx.chatMembers.getUserList()));
  console.log(await consume(ctx.chatMembers.getChatMemberList()));
  console.log(await consume(adapter.keys()));
  console.log(await consume(adapter.values()));
  console.log(await consume(adapter.entries()));

  return ctx.reply(JSON.stringify(ctx.update, null, 2)).catch(() => {});
});

bot.start({
  onStart: (me) => {
    console.log(`Listening on @${me.username}`);
  },
  allowed_updates: API_CONSTANTS.ALL_UPDATE_TYPES,
});
