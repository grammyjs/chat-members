import { Bot, MemorySessionStorage } from "https://deno.land/x/grammy/mod.ts";
import { ChatMember } from "./src/deps.deno.ts";
import { chatMembers, ChatMembersContext } from "./src/mod.ts";

const adapter = new MemorySessionStorage<ChatMember>();

const bot = new Bot<ChatMembersContext>("");
bot.use(chatMembers(adapter));

bot.on("message", (ctx, next) => {
  ctx.chatMembers.getChatMember(1234);
  return next();
});
