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
