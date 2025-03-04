import { assertEquals } from "jsr:@std/assert@1";
import { assertType, IsExact } from "jsr:@std/testing/types";
import {
  Api,
  type ChatMember,
  type ChatMemberAdministrator,
  type ChatMemberBanned,
  type ChatMemberLeft,
  type ChatMemberMember,
  type ChatMemberOwner,
  type ChatMemberRestricted,
  type ChatMemberUpdated,
  Context,
  type UserFromGetMe,
} from "./deps.deno.ts";
import {
  type ChatMemberAdmin,
  chatMemberFilter,
  type ChatMemberFree,
  type ChatMemberIn,
  chatMemberIs,
  type ChatMemberOut,
  ChatMemberQuery,
  type ChatMemberRegular,
  type ChatMemberRestrictedIn,
  type ChatMemberRestrictedOut,
  type FilteredChatMember,
  myChatMemberFilter,
} from "./filters.ts";

type ChatMemberStatusBase = Exclude<ChatMember["status"], "restricted"> | "restricted_in" | "restricted_out";

Deno.test("filter queries should produce the correct type", () => {
  assertType<IsExact<FilteredChatMember<ChatMember, "admin">, ChatMemberAdmin>>(true);
  assertType<IsExact<FilteredChatMember<ChatMember, "administrator">, ChatMemberAdministrator>>;
  assertType<IsExact<FilteredChatMember<ChatMember, "creator">, ChatMemberOwner>>(true);
  assertType<IsExact<FilteredChatMember<ChatMember, "free">, ChatMemberFree>>(true);
  assertType<IsExact<FilteredChatMember<ChatMember, "in">, ChatMemberIn>>(true);
  assertType<IsExact<FilteredChatMember<ChatMember, "out">, ChatMemberOut>>(true);
  assertType<IsExact<FilteredChatMember<ChatMember, "regular">, ChatMemberRegular>>(true);
  assertType<IsExact<FilteredChatMember<ChatMember, "kicked">, ChatMemberBanned>>(true);
  assertType<IsExact<FilteredChatMember<ChatMember, "left">, ChatMemberLeft>>(true);
  assertType<IsExact<FilteredChatMember<ChatMember, "member">, ChatMemberMember>>(true);
  assertType<IsExact<FilteredChatMember<ChatMember, "restricted">, ChatMemberRestricted>>(true);
  assertType<IsExact<FilteredChatMember<ChatMember, "restricted_in">, ChatMemberRestrictedIn>>(true);
  assertType<IsExact<FilteredChatMember<ChatMember, "restricted_out">, ChatMemberRestrictedOut>>(true);
});

Deno.test("should apply query to chat member", () => {
  const results: Record<ChatMemberStatusBase, Record<Exclude<ChatMemberQuery, ChatMember["status"]>, boolean>> = {
    administrator: {
      in: true,
      out: false,
      free: true,
      admin: true,
      regular: false,
      restricted_in: false,
      restricted_out: false,
    },
    creator: {
      in: true,
      out: false,
      free: true,
      admin: true,
      regular: false,
      restricted_in: false,
      restricted_out: false,
    },
    member: {
      in: true,
      out: false,
      free: true,
      admin: false,
      regular: true,
      restricted_in: false,
      restricted_out: false,
    },
    restricted_in: {
      in: true,
      out: false,
      free: false,
      admin: false,
      regular: true,
      restricted_in: true,
      restricted_out: false,
    },
    restricted_out: {
      in: false,
      out: true,
      free: false,
      admin: false,
      regular: false,
      restricted_in: false,
      restricted_out: true,
    },
    left: {
      in: false,
      out: true,
      free: false,
      admin: false,
      regular: false,
      restricted_in: false,
      restricted_out: false,
    },
    kicked: {
      in: false,
      out: true,
      free: false,
      admin: false,
      regular: false,
      restricted_in: false,
      restricted_out: false,
    },
  } as const;

  const statuses: ChatMember["status"][] = ["administrator", "creator", "kicked", "left", "member", "restricted"];
  const baseStatuses = Object.keys(results) as ChatMemberStatusBase[];
  baseStatuses.forEach((status) => {
    const chatMember = (
      status === "restricted_in"
        ? { status: "restricted", is_member: true }
        : status === "restricted_out"
        ? { status: "restricted", is_member: false }
        : { status }
    ) as ChatMember;
    const statusResults = results[status];

    const queries = Object.keys(results[status]) as (keyof typeof statusResults)[];
    queries.forEach((query) => {
      assertEquals(chatMemberIs(chatMember, query), statusResults[query]);
    });

    statuses.forEach((query) => {
      assertEquals(chatMemberIs(chatMember, query), chatMember.status === query);
    });
  });
});

Deno.test("should filter myChatMember", () => {
  const administratorKickedCtx = new Context(
    {
      update_id: 123,
      my_chat_member: {
        old_chat_member: { status: "administrator" },
        new_chat_member: { status: "kicked" },
      } as ChatMemberUpdated,
    },
    new Api(""),
    {} as UserFromGetMe,
  );
  const administratorKickedFilters = [
    ["administrator", "kicked", true],
    ["administrator", "out", true],
    ["admin", "kicked", true],
    ["admin", "out", true],
    ["in", "out", true],
    ["regular", "kicked", false],
    ["member", "out", false],
    ["administrator", "member", false],
    ["admin", "in", false],
    ["out", "in", false],
  ] as const;

  administratorKickedFilters.forEach(([oldStatus, newStatus, expected]) => {
    const filter = myChatMemberFilter(oldStatus, newStatus);
    assertEquals(filter(administratorKickedCtx), expected);
  });
});

Deno.test("should filter chatMember", () => {
  const leftRestrictedInCtx = new Context(
    {
      update_id: 123,
      chat_member: {
        old_chat_member: { status: "left" },
        new_chat_member: { status: "restricted", is_member: true },
      } as ChatMemberUpdated,
    },
    new Api(""),
    {} as UserFromGetMe,
  );
  const administratorKickedFilters = [
    ["left", "restricted", true],
    ["restricted", "left", false],
    ["out", "in", true],
    ["in", "out", false],
    ["out", "admin", false],
    ["kicked", "restricted", false],
    ["out", "free", false],
    ["kicked", "member", false],
    ["member", "out", false],
  ] as const;

  administratorKickedFilters.forEach(([oldStatus, newStatus, expected]) => {
    const filter = chatMemberFilter(oldStatus, newStatus);
    assertEquals(filter(leftRestrictedInCtx), expected);
  });
});

Deno.test("should filter out other types of updates", () => {
  const administratorAdministratorCtx = new Context(
    {
      update_id: 123,
      chat_member: {
        old_chat_member: { status: "administrator" },
        new_chat_member: { status: "administrator" },
      } as ChatMemberUpdated,
    },
    new Api(""),
    {} as UserFromGetMe,
  );
  assertEquals(myChatMemberFilter("admin", "admin")(administratorAdministratorCtx), false);
  assertEquals(chatMemberFilter("admin", "admin")(administratorAdministratorCtx), true);

  const memberRestrictedCtx = new Context(
    {
      update_id: 123,
      my_chat_member: {
        old_chat_member: { status: "member" },
        new_chat_member: { status: "restricted", is_member: true },
      } as ChatMemberUpdated,
    },
    new Api(""),
    {} as UserFromGetMe,
  );
  assertEquals(myChatMemberFilter("free", "restricted")(memberRestrictedCtx), true);
  assertEquals(chatMemberFilter("free", "restricted")(memberRestrictedCtx), false);
});
