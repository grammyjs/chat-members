import { assert } from "jsr:@std/assert@1";
import { IsExact, assertType } from "jsr:@std/testing/types";
import { Api, type ChatMember, Context, type Update } from "./deps.deno.ts";
import type { ChatMemberIn, ChatMemberRestrictedIn } from "./filters.ts";
import { hydrateChatMember, type HydrateChatMemberApiFlavor, type HydrateChatMemberFlavor } from "./hydrate.ts";

Deno.test("hydrateChatMember transformer should apply to getChatMember", async () => {
  const api = new Api("") as HydrateChatMemberApiFlavor<Api>;
  api.config.use((_prev, method, _payload, _signal) => {
    // mock call to always return a valid result
    if (method === "getChatMember") {
      return Promise.resolve({
        ok: true,
        result: {
          status: "restricted",
          is_member: true,
          user: {},
          // deno-lint-ignore no-explicit-any
        } as ChatMember as any,
      });
    }
    throw new Error("Not implemented");
  });
  api.config.use(hydrateChatMember());

  const chatMember = await api.getChatMember(1, 2);
  assert(Object.prototype.hasOwnProperty.call(chatMember, "is"));

  assert(chatMember.is("in"));
  assertType<IsExact<(typeof chatMember)["status"], ChatMemberIn["status"]>>(true)

  assert(chatMember.is("restricted"));
  assertType<IsExact<(typeof chatMember)["status"], ChatMemberRestrictedIn["status"]>>(true);
  assertType<IsExact<(typeof chatMember)["is_member"], ChatMemberRestrictedIn["is_member"]>>(true);
});

Deno.test("hydrateChatMember transformer should apply to getChatAdministrators", async () => {
  const api = new Api("") as HydrateChatMemberApiFlavor<Api>;
  api.config.use((_prev, method, _payload, _signal) => {
    // mock call to always return a valid result
    if (method === "getChatAdministrators") {
      return Promise.resolve({
        ok: true,
        result: [
          {
            status: "creator",
            user: {},
          } as ChatMember,
          {
            status: "administrator",
            user: {},
          } as ChatMember,
          // deno-lint-ignore no-explicit-any
        ] as any,
      });
    }
    throw new Error("Not implemented");
  });
  api.config.use(hydrateChatMember());

  const chatAdministrators = await api.getChatAdministrators(1);
  chatAdministrators.forEach((admin) => {
    assert(Object.prototype.hasOwnProperty.call(admin, "is"));
    assert(admin.is("admin"));
    assert(!admin.is("out"));
  });
});

Deno.test("hydrateChatMember transformer should apply to getAuthor", async () => {
  const api = new Api("") as HydrateChatMemberApiFlavor<Api>;
  api.config.use((_prev, method, _payload, _signal) => {
    // mock call to always return a valid result
    if (method === "getChatMember") {
      return Promise.resolve({
        ok: true,
        result: {
          status: "member",
          // deno-lint-ignore no-explicit-any
        } as ChatMember as any,
      });
    }
    throw new Error("Not implemented");
  });
  api.config.use(hydrateChatMember());
  const ctx = new Context(
    {
      update_id: 1,
      message: {
        from: { id: 2 },
        chat: { id: 1 },
      } as Update["message"],
    },
    api,
    // deno-lint-ignore no-explicit-any
    {} as any
  ) as HydrateChatMemberFlavor<Context>;

  const chatMember = await ctx.getAuthor();
  assert(chatMember.is("in"));
  assert(chatMember.is("member"));
  assert(!chatMember.is("out"));
});
