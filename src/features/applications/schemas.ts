import { z } from "zod";

export const applicationIdSchema = z.object({ applicationId: z.uuid() });
