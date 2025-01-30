import type {
    ChatMember,
    ChatMemberAdministrator,
    ChatMemberBanned,
    ChatMemberLeft,
    ChatMemberMember,
    ChatMemberOwner,
    ChatMemberRestricted,
    Context,
    Filter,
} from "./deps.deno.ts";

/*
 * The 'restricted' status is ambiguous, since it can refer both to a member in
 * the group and a member out of the group.
 * To avoid ambiguity we split the restricted role into "restricted_in" and
 * "restricted_out".
 */

/**
 * A member of the chat, with restrictions applied.
 */
export type ChatMemberRestrictedIn = ChatMemberRestricted & { is_member: true };
/**
 * Not a member of the chat, with restrictions applied.
 */
export type ChatMemberRestrictedOut = ChatMemberRestricted & {
    is_member: false;
};
/**
 * A member of the chat, with any role, possibly restricted.
 */
export type ChatMemberIn =
    | ChatMemberAdministrator
    | ChatMemberOwner
    | ChatMemberRestrictedIn
    | ChatMemberMember;
/**
 * Not a member of the chat
 */
export type ChatMemberOut =
    | ChatMemberBanned
    | ChatMemberLeft
    | ChatMemberRestrictedOut;
/**
 * A member of the chat, with any role, not restricted.
 */
export type ChatMemberFree =
    | ChatMemberAdministrator
    | ChatMemberOwner
    | ChatMemberMember;
/**
 * An admin of the chat, either administrator or owner.
 */
export type ChatMemberAdmin = ChatMemberAdministrator | ChatMemberOwner;
/**
 * A regular (non-admin) user of the chat, possibly restricted.
 */
export type ChatMemberRegular = ChatMemberRestrictedIn | ChatMemberMember;
/**
 * Query type for chat member status.
 */
export type ChatMemberQuery =
    | "in"
    | "out"
    | "free"
    | "admin"
    | "regular"
    | "restricted_in"
    | "restricted_out"
    | ChatMember["status"];

/**
 * Used to normalize queries to the simplest components.
 */
const chatMemberQueries = {
    admin: ["administrator", "creator"],
    administrator: ["administrator"],
    creator: ["creator"],
    free: ["administrator", "creator", "member"],
    in: ["administrator", "creator", "member", "restricted_in"],
    out: ["kicked", "left", "restricted_out"],
    regular: ["member", "restricted_in"],
    kicked: ["kicked"],
    left: ["left"],
    member: ["member"],
    restricted: ["restricted"],
    restricted_in: ["restricted_in"],
    restricted_out: ["restricted_out"],
} as const satisfies Record<
    ChatMemberQuery,
    (ChatMember["status"] | "restricted_in" | "restricted_out")[]
>;

/**
 * Maps from the query to the corresponding type.
 */
type ChatMemberQueriesMap = {
    admin: ChatMemberAdmin;
    administrator: ChatMemberAdministrator;
    creator: ChatMemberOwner;
    free: ChatMemberFree;
    in: ChatMemberIn;
    out: ChatMemberOut;
    regular: ChatMemberRegular;
    kicked: ChatMemberBanned;
    left: ChatMemberLeft;
    member: ChatMemberMember;
    restricted: ChatMemberRestricted;
    restricted_in: ChatMemberRestrictedIn;
    restricted_out: ChatMemberRestrictedOut;
};

type NormalizeChatMemberQueryCore<Q extends ChatMemberQuery> = (typeof chatMemberQueries)[Q][number];

type MaybeArray<T> = T | T[];
type NormalizeChatMemberQuery<
    Q extends ChatMemberQuery,
> = Q extends ChatMemberQuery ? NormalizeChatMemberQueryCore<Q>
    : (Q extends ChatMemberQuery[] ? NormalizeChatMemberQuery<Q[number]>
        : never);
export type FilteredChatMember<
    C extends ChatMember,
    Q extends ChatMemberQuery,
> = C & ChatMemberQueriesMap[NormalizeChatMemberQuery<Q>];

/**
 * Normalizes the query, returning the corresponding list of chat member
 * statuses.
 */
function normalizeChatMemberQuery<T extends ChatMemberQuery>(
    query: MaybeArray<T>,
): NormalizeChatMemberQuery<T>[] {
    if (Array.isArray(query)) {
        const res = new Set<ChatMemberQuery>(
            query.flatMap(normalizeChatMemberQuery),
        );
        return [...res] as NormalizeChatMemberQuery<T>[];
    }

    return [
        ...chatMemberQueries[query],
    ] as NormalizeChatMemberQuery<T>[];
}

/**
 * Utility function to query the status of a chat member.
 *
 * Pass one of 'restricted_in', 'restricted_out', 'in', 'out', 'free', 'admin',
 * 'regular', or one of the default Telegram statuses ('administrator',
 * 'creator', 'kicked', 'left', 'member', 'restricted'), or an array of them.
 *
 * Returns true if the chat member matches the query.
 */
export function chatMemberIs<
    C extends ChatMember,
    Q extends ChatMemberQuery,
>(
    chatMember: C,
    query: MaybeArray<Q>,
): chatMember is FilteredChatMember<C, Q> {
    const roles = normalizeChatMemberQuery(query);

    if (chatMember.status === "restricted") {
        if (roles.includes("restricted" as (typeof roles)[number])) {
            return true;
        } else if (chatMember.is_member) {
            return roles.includes("restricted_in" as (typeof roles)[number]);
        } else {
            return roles.includes("restricted_out" as (typeof roles)[number]);
        }
    }

    return roles.includes(chatMember.status as (typeof roles)[number]);
}

/**
 * Filter context to only find updates of type 'my_chat_member' where the status
 * transitions from oldStatus to newStatus.
 *
 * Example:
 * ```typescript
 * // listen for updates where the bot enters a group/supergroup
 * bot.chatType(['group', 'supergroup']).filter(
 *  myChatMemberFilter('out', 'in'),
 *  (ctx) => {
 *    const { old_chat_member: oldChatMember, new_chat_member: newChatMember } =
 *      ctx.myChatMember;
 *    // ...
 *  },
 * );
 */
export function myChatMemberFilter<
    C extends Context,
    Q1 extends ChatMemberQuery,
    Q2 extends ChatMemberQuery,
>(oldStatus: MaybeArray<Q1>, newStatus: MaybeArray<Q2>) {
    return (
        ctx: C,
    ): ctx is Filter<C, "my_chat_member"> & {
        myChatMember: {
            old_chat_member: FilteredChatMember<ChatMember, Q1>;
            new_chat_member: FilteredChatMember<ChatMember, Q2>;
        };
    } => {
        return (
            ctx.has("my_chat_member") &&
            chatMemberIs(ctx.myChatMember.old_chat_member, oldStatus) &&
            chatMemberIs(ctx.myChatMember.new_chat_member, newStatus)
        );
    };
}

/**
 * Filter context to only find updates of type 'chat_member' where the status
 * transitions from oldStatus to newStatus.
 *
 * Example:
 * ```typescript
 * // listen for updates where a user leaves a channel
 * bot.chatType('channel').filter(
 *  chatMemberFilter('in', 'out'),
 *  (ctx) => {
 *    const { old_chat_member: oldChatMember, new_chat_member: newChatMember } =
 *      ctx.chatMember;
 *    // ...
 *  },
 * );
 * ```
 *
 * **Note**: To receive these updates the bot must be admin in the chat **and**
 * you must add 'chat_member' to the list of allowed updates.
 */
export function chatMemberFilter<
    C extends Context,
    Q1 extends ChatMemberQuery,
    Q2 extends ChatMemberQuery,
>(oldStatus: MaybeArray<Q1>, newStatus: MaybeArray<Q2>) {
    return (
        ctx: C,
    ): ctx is Filter<C, "chat_member"> & {
        chatMember: {
            old_chat_member: FilteredChatMember<ChatMember, Q1>;
            new_chat_member: FilteredChatMember<ChatMember, Q2>;
        };
    } => {
        return (
            ctx.has("chat_member") &&
            chatMemberIs(ctx.chatMember.old_chat_member, oldStatus) &&
            chatMemberIs(ctx.chatMember.new_chat_member, newStatus)
        );
    };
}
