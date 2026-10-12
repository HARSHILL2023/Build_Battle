import { Counter } from "../models/Counter.js";

// Reserve `count` sequential numeric ids for a collection. Returns the
// first id in the reserved block.
export async function reserveSeq(name: string, count = 1): Promise<number> {
  const doc = (await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: count } },
    { upsert: true, returnDocument: "after" }
  ).lean()) as { seq: number } | null;
  const current = doc?.seq ?? count;
  return current - count + 1;
}

export async function ensureSeqAtLeast(name: string, value: number): Promise<void> {
  await Counter.findOneAndUpdate({ name }, { $max: { seq: value } }, { upsert: true });
}
