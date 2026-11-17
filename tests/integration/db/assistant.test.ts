import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDatabase, createUser } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;

const newThread = async (userId: string, title = "How is my search going?") =>
  (
    await asUser(db, userId, () =>
      db.query<{ id: string }>("insert into public.assistant_threads (user_id, title) values ($1, $2) returning id", [userId, title]),
    )
  ).rows[0]?.id ?? "";

const addMessage = (userId: string, threadId: string, role: string, content: string) =>
  asUser(db, userId, () =>
    db.query("insert into public.assistant_messages (user_id, thread_id, role, content) values ($1, $2, $3, $4)", [
      userId,
      threadId,
      role,
      content,
    ]),
  );

beforeAll(async () => {
  db = await createMigratedDatabase();
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
}, 60_000);

describe("assistant chat", () => {
  it("stores a thread with messages and bumps the thread on each message", async () => {
    const threadId = await newThread(alice);
    const updatedAt = async () =>
      (await db.query<{ t: string }>("select updated_at::text as t from public.assistant_threads where id = $1", [threadId])).rows[0]?.t;
    const before = await updatedAt();
    await addMessage(alice, threadId, "user", "How many jobs are qualified?");
    await addMessage(alice, threadId, "assistant", "You have 3 qualified jobs.");

    expect(await updatedAt()).not.toBe(before);
    const messages = await asUser(db, alice, () =>
      db.query("select role from public.assistant_messages where thread_id = $1 order by created_at", [threadId]),
    );
    expect(messages.rows).toHaveLength(2);
  });

  it("hides threads and messages from other users and refuses foreign threads", async () => {
    const threadId = await newThread(alice);
    await addMessage(alice, threadId, "user", "secret question");

    const seen = await asUser(db, bob, () =>
      db.query("select id from public.assistant_messages where thread_id = $1", [threadId]),
    );
    expect(seen.rows).toHaveLength(0);
    await expect(addMessage(bob, threadId, "user", "hi")).rejects.toThrow();
  });

  it("keeps messages append-only", async () => {
    const threadId = await newThread(alice);
    await addMessage(alice, threadId, "assistant", "original");
    await expect(
      asUser(db, alice, () => db.query("update public.assistant_messages set content = 'edited' where thread_id = $1", [threadId])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, alice, () => db.query("delete from public.assistant_messages where thread_id = $1", [threadId])),
    ).rejects.toThrow(/permission denied/);
  });

  it("deletes messages with their thread", async () => {
    const threadId = await newThread(alice);
    await addMessage(alice, threadId, "user", "bye");
    await asUser(db, alice, () => db.query("delete from public.assistant_threads where id = $1", [threadId]));
    const left = await db.query("select id from public.assistant_messages where thread_id = $1", [threadId]);
    expect(left.rows).toHaveLength(0);
  });

  it("rejects empty or oversized content and bad titles", async () => {
    const threadId = await newThread(alice);
    await expect(addMessage(alice, threadId, "user", "")).rejects.toThrow();
    await expect(addMessage(alice, threadId, "user", "x".repeat(20001))).rejects.toThrow();
    await expect(newThread(alice, "")).rejects.toThrow();
  });

  it("seeds the assistant prompt", async () => {
    const prompt = await db.query("select 1 from public.prompt_versions where prompt_key = 'assistant.chat' and is_active");
    expect(prompt.rows).toHaveLength(1);
  });
});
