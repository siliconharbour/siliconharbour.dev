export type Plain<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Plain<U>[]
    : T extends object
      ? { [K in keyof T]: Plain<T[K]> }
      : T;
export function toPlain<T>(value: T): Plain<T> {
  return JSON.parse(JSON.stringify(value)) as Plain<T>;
}
