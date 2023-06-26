export type MaybePromise<T> = Promise<T> | T;
export type CascadingKey = string[];
export type Key = string | CascadingKey;
export type KV<T> = [key: CascadingKey, value: T];

export type MaybeAsyncIterable<T> = Iterable<T> | AsyncIterable<T>;

/**
 * A storage adapter is an abstraction that provides read, write, and delete
 * access to a storage solution of any kind. Storage adapters are used to keep
 * session middleware independent of your database provider, and they allow you
 * to pass your own storage solution.
 */
export interface StorageAdapter<T> {
  /**
   * Reads a value for the given key from the storage. May return the value or
   * undefined, or a promise of either.
   */
  read: (key: Key) => MaybePromise<T | undefined>;
  /**
   * Writes a value for the given key to the storage.
   */
  write: (key: Key, value: T) => MaybePromise<void>;
  /**
   * Deletes a value for the given key from the storage.
   */
  delete: (key: Key) => MaybePromise<void>;
  /**
   * Checks whether a key exists in the storage.
   */
  has: (key: Key) => MaybePromise<boolean>;
  /**
   * Lists all keys via an iterator. Optionally, only lists keys that start
   * with a given prefix.
   */
  keys: (prefix?: Key) => MaybeAsyncIterable<CascadingKey>;
  /**
   * Lists all values via an iterator. Optionally, only lists values for keys
   * that start with a given prefix.
   */
  values: <V extends T = T>(prefix?: Key) => MaybeAsyncIterable<V>;
  /**
   * Lists all key-value pairs via an iterator. Optionally, only lists pairs
   * with keys that start with a given prefix.
   */
  entries: (prefix?: Key) => MaybeAsyncIterable<KV<T>>;
}

/* ========================= Everything below this should be removed before the v2 release ========================= */

function cascade(key: Key): CascadingKey {
  return Array.isArray(key) ? key : [key];
}

interface TrieNode<T> {
  children: Map<string, TrieNode<T>> | undefined;
  value: T | undefined;
}

class Trie<T> {
  private root: TrieNode<T> = { children: undefined, value: undefined };
  private at(key: string[]): TrieNode<T> | undefined {
    const len = key.length;
    let node = this.root;
    for (let i = 0; i < len; i++) {
      const n = node.children?.get(key[i]);
      if (n === undefined) /* fast path */ return undefined;
      node = n;
    }
    return node;
  }
  get(key: string[]): T | undefined {
    return this.at(key)?.value;
  }
  set(key: string[], value: T): void {
    const len = key.length;
    let node = this.root;
    for (let i = 0; i < len; i++) {
      const seg = key[i];
      let children = node.children;
      if (children === undefined) {
        children = new Map();
        node.children = children;
      }
      let n = children.get(seg);
      if (n === undefined) {
        n = { children: undefined, value: undefined };
        children.set(seg, n);
      }
      node = n;
    }
    node.value = value;
  }
  delete(key: string[]): void {
    const len = key.length;
    const path = [this.root];
    for (let i = 0; i < len; i++) {
      const n = path[i].children?.get(key[i]);
      if (n === undefined) /* fast path */ return;
      path.push(n);
    }
    const last = path.length - 1;
    const lastNode = path[last];
    lastNode.value = undefined;
    if (lastNode.children !== undefined) {
      return;
    }
    for (let i = last; i > 0 && path[i].value === undefined; i--) {
      const parent = path[i - 1];
      const siblings = parent.children!;
      siblings.delete(key[i]);
      if (siblings.size > 0) {
        break;
      }
      parent.children = undefined;
    }
  }
  *entries(prefix: string[] = []): Generator<[string[], T]> {
    const root = this.at(prefix);
    if (root === undefined) return;
    const cursors = [(function* () {
      yield [prefix.slice(), root] as const;
    })()];
    while (cursors.length > 0) {
      const cursor = cursors[cursors.length - 1];
      const step = cursor.next();

      if (step.done) {
        cursors.pop();
        continue;
      }

      const [key, { value, children }] = step.value;

      if (value !== undefined) {
        yield [key, value];
      }

      if (children !== undefined) {
        cursors.push((function* () {
          for (const [seg, child] of children.entries()) {
            yield [key.concat(seg), child];
          }
        })());
      }
    }
  }
  *keys(prefix: string[] = []): Generator<string[]> {
    for (const [k] of this.entries(prefix)) yield k;
  }
}

// === Memory storage adapter
/**
 * The memory session storage is a built-in storage adapter that saves your
 * session data in RAM using a regular JavaScript `Map` object. If you use this
 * storage adapter, all sessions will be lost when your process terminates or
 * restarts. Hence, you should only use it for short-lived data that is not
 * important to persist.
 *
 * This class is used as default if you do not provide a storage adapter, e.g.
 * to your database.
 *
 * This storage adapter features expiring sessions. When instantiating this class
 * yourself, you can pass a time to live in milliseconds that will be used for
 * each session object. If a session for a user expired, the session data will
 * be discarded on its first read, and a fresh session object as returned by the
 * `initial` option (or undefined) will be put into place.
 */
export class MemorySessionStorage<S> implements StorageAdapter<S> {
  /**
   * Internally used `Trie` instance that stores the session data
   */
  protected readonly storage = new Trie<{ session: S; expires?: number }>();

  /**
   * Constructs a new memory session storage with the given time to live. Note
   * that this storage adapter will not store your data permanently.
   *
   * @param timeToLive TTL in milliseconds, default is `Infinity`
   */
  constructor(private readonly timeToLive?: number) {}

  read(key: Key) {
    const value = this.storage.get(cascade(key));

    if (value === undefined) return undefined;
    if (value.expires !== undefined && value.expires < Date.now()) {
      this.delete(key);
      return undefined;
    }
    return value.session;
  }

  /**
   * @deprecated Use {@link readAllValues} instead
   */
  readAll() {
    return this.readAllValues();
  }
  /**
   * @deprecated Use {@link keys} instead
   */
  readAllKeys() {
    return Array.from(this.keys());
  }
  /**
   * @deprecated Use {@link values} instead
   */
  readAllValues() {
    return Array.from(this.values());
  }
  /**
   * @deprecated Use {@link entries} instead
   */
  readAllEntries() {
    return Array.from(this.entries());
  }

  has(key: Key) {
    return this.read(key) !== undefined;
  }

  write(key: Key, value: S) {
    this.storage.set(cascade(key), addExpiryDate(value, this.timeToLive));
  }

  delete(key: Key) {
    this.storage.delete(cascade(key));
  }

  *keys(prefix?: Key) {
    for (const key of this.storage.keys(cascade(prefix ?? []))) yield key;
  }
  *entries(prefix?: Key) {
    for (const key of this.keys(prefix)) {
      const value = this.read(key);
      if (value !== undefined) {
        const entry: [CascadingKey, S] = [key, value];
        yield entry;
      }
    }
  }
  *values<V extends S = S>(prefix?: Key) {
    for (const [, value] of this.entries(prefix)) yield value as V;
  }
}

function addExpiryDate<T>(value: T, ttl?: number) {
  if (ttl !== undefined && ttl < Infinity) {
    const now = Date.now();
    return { session: value, expires: now + ttl };
  } else {
    return { session: value };
  }
}
