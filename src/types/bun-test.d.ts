// Minimal typings for Bun's built-in test runner (used by `bun test`; no extra package needed).
declare module "bun:test" {
  interface Expectation {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatch(expected: string | RegExp): void;
    toThrow(expected?: string | RegExp): void;
    not: Expectation;
    rejects: {
      toThrow(expected?: string | RegExp): Promise<void>;
    };
  }

  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect(value: unknown): Expectation;
}
