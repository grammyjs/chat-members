import { assert } from "jsr:@std/assert@1";
import { Api, type ChatMember, Context, type Update } from "./deps.deno.ts";
import type { ChatMemberIn, ChatMemberRestrictedIn } from "./filters.ts";
import { hydrateChatMember, type HydrateChatMemberApiFlavor, type HydrateChatMemberFlavor } from "./hydrate.ts";

Deno.test("hydrateChatMember transformer should apply to getChatMember", async () => {
  const api = new Api("") as HydrateChatMemberApiFlavor<Api>;
  // deno-lint-ignore require-await
  api.config.use(async (_prev, method, _payload, _signal) => {
    // mock call to always return a valid result
    if (method === "getChatMember") {
      return {
        ok: true,
        result: {
          status: "restricted",
          is_member: true,
          user: {},
        } as ChatMember,
        // deno-lint-ignore no-explicit-any
      } as any;
    }
    throw new Error("Not implemented");
  });
  api.config.use(hydrateChatMember());

  type Expect<T extends true> = T;
  type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <
    T,
  >() => T extends Y ? 1 : 2 ? true
    : false;

  const chatMember = await api.getChatMember(1, 2);
  assert(Object.prototype.hasOwnProperty.call(chatMember, "is"));

  assert(chatMember.is("in"));
  type InTest = Expect<
    Equal<(typeof chatMember)["status"], ChatMemberIn["status"]>
  >;

  assert(chatMember.is("restricted"));
  type RestrictedInTest =
    & Expect<
      Equal<(typeof chatMember)["status"], ChatMemberRestrictedIn["status"]>
    >
    & Expect<
      Equal<
        (typeof chatMember)["is_member"],
        ChatMemberRestrictedIn["is_member"]
      >
    >;
});

Deno.test("hydrateChatMember transformer should apply to getChatAdministrators", async () => {
  const api = new Api("") as HydrateChatMemberApiFlavor<Api>;
  // deno-lint-ignore require-await
  api.config.use(async (_prev, method, _payload, _signal) => {
    // mock call to always return a valid result
    if (method === "getChatAdministrators") {
      return {
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
        ],
        // deno-lint-ignore no-explicit-any
      } as any;
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
  // deno-lint-ignore require-await
  api.config.use(async (_prev, method, _payload, _signal) => {
    // mock call to always return a valid result
    if (method === "getChatMember") {
      return {
        ok: true,
        result: {
          status: "member",
        } as ChatMember,
        // deno-lint-ignore no-explicit-any
      } as any;
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
    {} as any,
  ) as HydrateChatMemberFlavor<Context>;

  const chatMember = await ctx.getAuthor();
  assert(chatMember.is("in"));
  assert(chatMember.is("member"));
  assert(!chatMember.is("out"));
});
