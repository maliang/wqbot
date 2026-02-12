declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: typeof Database
  }

  export interface QueryExecResult {
    columns: string[]
    values: SqlValue[][]
  }

  export type SqlValue = string | number | Uint8Array | null

  export interface ParamsObject {
    [key: string]: SqlValue
  }

  export interface ParamsCallback {
    (obj: ParamsObject): void
  }

  export interface Database {
    run(sql: string, params?: SqlValue[] | ParamsObject): Database
    exec(sql: string, params?: SqlValue[]): QueryExecResult[]
    each(
      sql: string,
      params: SqlValue[] | ParamsObject | undefined,
      callback: ParamsCallback,
      done: () => void
    ): Database
    prepare(sql: string, params?: SqlValue[]): Statement
    export(): Uint8Array
    close(): void
    getRowsModified(): number
  }

  export interface Statement {
    bind(params?: SqlValue[] | ParamsObject): boolean
    step(): boolean
    getColumnNames(): string[]
    get(params?: SqlValue[] | ParamsObject): SqlValue[]
    getAsObject(params?: SqlValue[] | ParamsObject): ParamsObject
    run(params?: SqlValue[] | ParamsObject): void
    reset(): void
    freemem(): void
    free(): boolean
  }

  export interface SqlJsConfig {
    locateFile?: (filename: string) => string
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>
}
