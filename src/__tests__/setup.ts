// IndexedDB for node — must load before anything imports db.ts
import "fake-indexeddb/auto";
import { beforeEach } from "vitest";
import { db } from "../db/db";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});
