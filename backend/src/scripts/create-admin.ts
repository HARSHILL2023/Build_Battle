import readline from "node:readline";
import { connectDb, disconnectDb } from "../config/db.js";
import { User } from "../models/User.js";
import {
  emailSchema,
  hashPassword,
  normalizeEmail,
  passwordSchema,
} from "../services/passwordService.js";

// One-time initial-administrator provisioning. Refuses to run when an admin
// already exists, so it can never replace or demote one. Recovery from a
// lost admin is an explicit operator action (remove users via mongosh, then
// re-run). Credentials come from an interactive prompt or, for scripted
// hosts, INSIGHTFLOW_SETUP_EMAIL / INSIGHTFLOW_SETUP_PASSWORD. Nothing is
// hardcoded and no default password exists.
function prompt(question: string, hidden: boolean): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (!hidden || !process.stdin.isTTY) {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    process.stdout.write(question);
    let value = "";
    const onData = (chunk: Buffer) => {
      const char = chunk.toString("utf8");
      if (char === "\r" || char === "\n" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.close();
        resolve(value);
        return;
      }
      if (char === "\u0003") {
        process.exit(1);
      }
      if (char === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };
    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  const existing = await User.countDocuments({ role: "admin" });
  if (existing > 0) {
    console.error("[setup] An administrator already exists. Refusing to provision another initial admin.");
    console.error("[setup] To add accounts, log in as an administrator and use account management.");
    process.exitCode = 1;
    return;
  }
  const envEmail = process.env.INSIGHTFLOW_SETUP_EMAIL?.trim();
  const envPassword = process.env.INSIGHTFLOW_SETUP_PASSWORD ?? "";
  const email = envEmail || (await prompt("Admin email: ", false));
  const password = envPassword || (await prompt("Admin password (min 12 chars): ", true));
  if (process.env.INSIGHTFLOW_SETUP_PASSWORD !== undefined) {
    delete process.env.INSIGHTFLOW_SETUP_PASSWORD;
  }
  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) {
    console.error("[setup] Invalid email address.");
    process.exitCode = 1;
    return;
  }
  const parsedPassword = passwordSchema.safeParse(password);
  if (!parsedPassword.success) {
    console.error("[setup] Password must be at least 12 characters.");
    process.exitCode = 1;
    return;
  }
  const normalized = normalizeEmail(parsedEmail.data);
  if (await User.findOne({ email: normalized }).select("_id").lean()) {
    console.error("[setup] An account with that email already exists.");
    process.exitCode = 1;
    return;
  }
  await User.create({ email: normalized, passwordHash: await hashPassword(password), role: "admin" });
  console.log(`[setup] Administrator created: ${normalized}`);
}

try {
  await connectDb();
  await main();
} catch (err) {
  console.error("[setup] Failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
