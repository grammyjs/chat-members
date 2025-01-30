import {
  type Api,
  type ChatMember,
  Context,
  type RawApi,
  type Transformer,
} from "./deps.deno.ts";
import type { ChatMemberQuery, FilteredChatMember } from "./filters.ts";
import { chatMemberIs } from "./mod.ts";

type MaybeArray<T> = T | T[];

type HydratedChatMember<C extends ChatMember> = C & {
  /**
   * Utility function to query the status of the chat member.
   *
   * Pass one of 'admin', 'free', 'in', 'out', 'regular', 'restricted_in',
   * 'restricted_out', or one of the default Telegram statuses ('administrator',
   * 'creator', 'kicked', 'left', 'member', 'restricted'), or an array of them.
   *
   * Returns true if the chat member matches the query.
   */
  is: <Q extends ChatMemberQuery>(
    query: MaybeArray<Q>,
  ) => this is FilteredChatMember<HydratedChatMember<C>, Q>;
};

/**
 * Hydrates the return type of a function
 */
type HydrateReturnType<
  // deno-lint-ignore no-explicit-any
  F extends (...args: any[]) => Promise<MaybeArray<ChatMember>>,
> = (
  ...args: Parameters<F>
) => Promise<
  Awaited<ReturnType<F>> extends infer C
    ? [C] extends [Array<ChatMember>] ? HydratedChatMember<C[number]>[]
    : [C] extends [ChatMember] ? HydratedChatMember<C>
    : never
    : never
>;

/**
 * Hydrate Context, Api, or RawApi.
 */
type AddHydrate<
  M extends (keyof Context | RawApi) & string,
  T extends Record<
    M,
    // deno-lint-ignore no-explicit-any
    (...args: any[]) => Promise<MaybeArray<ChatMember>>
  >,
> = {
  [K in M]: HydrateReturnType<T[K]>;
};

type RawApiHydrate<R extends RawApi> = AddHydrate<
  "getChatMember" | "getChatAdministrators",
  R
>;
type ApiHydrate<A extends Api> =
  & AddHydrate<"getChatMember" | "getChatAdministrators", A>
  & { raw: RawApiHydrate<A["raw"]> };
type ContextHydrate<C extends Context> =
  & AddHydrate<
    "getChatMember" | "getChatAdministrators" | "getAuthor",
    C
  >
  & { api: ApiHydrate<C["api"]> };

/**
 * Context flavor that adds a convenient `is` method to the results of
 * `getChatMember`, `getChatAdministrators`, and `getAuthor`.
 * Must be used together with the `hydrateChatMember` api transformer.
 */
export type HydrateChatMemberFlavor<C extends Context> = ContextHydrate<C> & C;
/**
 * Api flavor that adds a convenient `is` method to the results of
 * `getChatMember` and `getChatAdministrators`.
 * Must be used together with the `hydrateChatMember` api transformer.
 */
export type HydrateChatMemberApiFlavor<A extends Api> = ApiHydrate<A> & A;

/**
 * Api transformer that adds a convenient `is` method to the objects returned by
 * `getChatMember`, `getChatAdministrators`, and `getAuthor`.
 *
 * Example:
 * ```typescript
 * const bot = new Bot<HydrateChatMemberFlavor<Context>>("");
 * bot.api.config.use(hydrateChatMember());
 *
 * bot.on("message", async (ctx) => {
 *   const author = await ctx.getAuthor();
 *   if (author.is("admin")) {
 *     author.status; // "creator" | "administrator"
 *   }
 * });
 * ```
 */
export function hydrateChatMember<R extends RawApi = RawApi>(): Transformer<R> {
  function hydrate(chatMember: ChatMember) {
    Object.defineProperty(chatMember, "is", {
      value: (query: ChatMemberQuery) => chatMemberIs(chatMember, query),
    });
  }

  return async (prev, method, payload, signal) => {
    const res = await prev(method, payload, signal);
    if (!res.ok) {
      return res;
    }

    if (method === "getChatMember") {
      hydrate(res.result as ChatMember);
    } else if (method === "getChatAdministrators") {
      (res.result as Array<ChatMember>).forEach(hydrate);
    }

    return res;
  };
}
