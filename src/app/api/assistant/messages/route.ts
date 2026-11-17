import { requireUser } from "@/server/auth";
import { UserFacingError } from "@/server/errors";
import { logger } from "@/lib/monitoring/logger";
import { sendMessageSchema, type AssistantStreamEvent } from "@/features/assistant/schemas";
import { sendMessage } from "@/features/assistant/server/assistant-service";

/**
 * POST /api/assistant/messages — asks Ask JobPilot one question and streams progress as
 * NDJSON (AssistantStreamEvent per line): thinking → tools → text deltas → done | error.
 * A Route Handler instead of a Server Action because actions cannot stream progress.
 */
export async function POST(request: Request) {
  // Server Actions check the origin for us; a cookie-authenticated POST handler must do it itself (CSRF).
  if (!isSameOrigin(request)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const ctx = await requireUser();
  const parsed = sendMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: AssistantStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // The browser went away; the answer is still saved.
        }
      };
      try {
        const reply = await sendMessage(ctx, parsed.data, send);
        send({ type: "done", ...reply });
        logger.info("assistant.message.send", { userId: ctx.userId });
      } catch (error) {
        if (error instanceof UserFacingError) {
          send({ type: "error", message: error.message });
        } else {
          logger.error("assistant.message.send.failed", { userId: ctx.userId, error });
          send({ type: "error", message: "The assistant could not answer. Try again." });
        }
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
