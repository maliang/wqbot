declare module 'bun:sqlite' {
  export class Database {
    constructor(filename: string)
    exec(sql: string): void
    prepare(sql: string): Statement
    transaction<T>(fn: () => T): () => T
    close(): void
  }

  interface Statement {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }
}
