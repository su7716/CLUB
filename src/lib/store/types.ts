import type { TabName } from "./schema";

export type Row = Record<string, string>;

export interface Store {
  list(tab: TabName): Promise<Row[]>;
  insert(tab: TabName, row: Partial<Row>): Promise<Row>;
  update(tab: TabName, id: string, patch: Partial<Row>): Promise<Row | null>;
  remove(tab: TabName, id: string): Promise<boolean>;
}
