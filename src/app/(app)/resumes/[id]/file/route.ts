import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { logger } from "@/lib/monitoring/logger";
import { UserFacingError } from "@/server/errors";
import { getResumeDownloadUrl } from "@/features/resumes/server/resume-repository";

/** GET /resumes/:id/file → redirect to a 60-second signed download URL for the owner's file. */
export async function GET(_request: Request, { params }: RouteContext<"/resumes/[id]/file">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new NextResponse("Not found", { status: 404 });

  const ctx = await requireUser();
  try {
    const url = await getResumeDownloadUrl(ctx, id);
    if (!url) return new NextResponse("Not found", { status: 404 });
    return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof UserFacingError) return new NextResponse("Not found", { status: 404 });
    logger.error("resumes.file.download_failed", { userId: ctx.userId, error });
    return new NextResponse("Download failed", { status: 500 });
  }
}
