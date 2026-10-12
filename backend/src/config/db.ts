import mongoose from "mongoose";
import { getEnv } from "./env.js";

let listenersWired = false;

function wireListeners(): void {
  if (listenersWired) return;
  listenersWired = true;
  mongoose.connection.on("error", (err) => {
    console.error("[insightflow] mongodb error:", err instanceof Error ? err.message : String(err));
  });
  mongoose.connection.on("disconnected", () => {
    console.error("[insightflow] mongodb disconnected; driver will retry in the background.");
  });
  mongoose.connection.on("connected", () => {
    console.log("[insightflow] mongodb connected.");
  });
}

export async function connectDb(uri?: string): Promise<typeof mongoose> {
  wireListeners();
  if (mongoose.connection.readyState === 1) return mongoose;
  const mongoUri = uri ?? getEnv().MONGODB_URI;
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function dbReadyState(): number {
  return mongoose.connection.readyState;
}
