type MaybePromise<T> = T | Promise<T>;

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
  read: (key: string) => MaybePromise<T | undefined>;
  /**
   * Writes a value for the given key to the storage.
   */
  write: (key: string, value: T) => MaybePromise<void>;
  /**
   * Deletes a value for the given key from the storage.
   */
  delete: (key: string) => MaybePromise<void>;
  /**
   * Checks whether a key exists in the storage.
   */
  has?: (key: string) => MaybePromise<boolean>;
  /**
   * Lists all keys.
   */
  readAllKeys?: () => Iterable<string> | AsyncIterable<string>;
  /**
   * Lists all values.
   */
  readAllValues?: () => Iterable<T> | AsyncIterable<T>;
  /**
   * Lists all keys with their values.
   */
  readAllEntries?: () =>
    | Iterable<[key: string, value: T]>
    | AsyncIterable<[key: string, value: T]>;
}
