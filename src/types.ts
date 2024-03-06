export type DeepPartial<T> = Partial<{ [k in keyof T]: DeepPartial<T[k]> }>;
