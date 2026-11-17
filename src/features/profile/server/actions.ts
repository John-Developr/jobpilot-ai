"use server";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/run-action";
import {
  bulkSkillsSchema,
  certificationSchema,
  deleteProfileItemSchema,
  educationSchema,
  experienceSchema,
  linkSchema,
  personalInfoSchema,
  preferencesSchema,
  projectSchema,
  skillSchema,
  updateOf,
} from "../schemas";
import * as career from "./career-repository";
import * as profile from "./profile-repository";
import { syncFromPortfolio, type PortfolioSyncResult } from "./portfolio-sync-service";
import { z } from "zod";

const SAVE_FAILED = "Could not save. Try again.";

const done = () => null;

export async function updatePersonalInfoAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: personalInfoSchema,
    input,
    event: "profile.personal_info.update",
    failMessage: SAVE_FAILED,
    run: (ctx, data) => profile.updatePersonalInfo(ctx, data).then(done),
  });
}

export async function updatePreferencesAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: preferencesSchema,
    input,
    event: "profile.preferences.update",
    failMessage: SAVE_FAILED,
    run: (ctx, data) => profile.updatePreferences(ctx, data).then(done),
  });
}

// --- Links --------------------------------------------------------------------

export async function createLinkAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: linkSchema,
    input,
    event: "profile.link.create",
    failMessage: SAVE_FAILED,
    run: (ctx, data) => profile.createLink(ctx, data).then(done),
  });
}

export async function updateLinkAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: updateOf(linkSchema),
    input,
    event: "profile.link.update",
    failMessage: SAVE_FAILED,
    run: (ctx, { id, values }) => profile.updateLink(ctx, id, values).then(done),
  });
}

// --- Experience ---------------------------------------------------------------

export async function createExperienceAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: experienceSchema,
    input,
    event: "profile.experience.create",
    failMessage: SAVE_FAILED,
    run: (ctx, data) => career.createExperience(ctx, data).then(done),
  });
}

export async function updateExperienceAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: updateOf(experienceSchema),
    input,
    event: "profile.experience.update",
    failMessage: SAVE_FAILED,
    run: (ctx, { id, values }) => career.updateExperience(ctx, id, values).then(done),
  });
}

// --- Skills -------------------------------------------------------------------

export async function createSkillAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: skillSchema,
    input,
    event: "profile.skill.create",
    failMessage: SAVE_FAILED,
    run: (ctx, data) => career.createSkill(ctx, data).then(done),
  });
}

export async function bulkCreateSkillsAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: bulkSkillsSchema,
    input,
    event: "profile.skill.bulk_create",
    failMessage: SAVE_FAILED,
    run: (ctx, { names, category }) => career.createSkills(ctx, names, category).then(done),
  });
}

export async function updateSkillAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: updateOf(skillSchema),
    input,
    event: "profile.skill.update",
    failMessage: SAVE_FAILED,
    run: (ctx, { id, values }) => career.updateSkill(ctx, id, values).then(done),
  });
}

// --- Education & certifications -----------------------------------------------

export async function createEducationAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: educationSchema,
    input,
    event: "profile.education.create",
    failMessage: SAVE_FAILED,
    run: (ctx, data) => career.createEducation(ctx, data).then(done),
  });
}

export async function updateEducationAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: updateOf(educationSchema),
    input,
    event: "profile.education.update",
    failMessage: SAVE_FAILED,
    run: (ctx, { id, values }) => career.updateEducation(ctx, id, values).then(done),
  });
}

export async function createCertificationAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: certificationSchema,
    input,
    event: "profile.certification.create",
    failMessage: SAVE_FAILED,
    run: (ctx, data) => career.createCertification(ctx, data).then(done),
  });
}

export async function updateCertificationAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: updateOf(certificationSchema),
    input,
    event: "profile.certification.update",
    failMessage: SAVE_FAILED,
    run: (ctx, { id, values }) => career.updateCertification(ctx, id, values).then(done),
  });
}

// --- Projects -----------------------------------------------------------------

export async function createProjectAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: projectSchema,
    input,
    event: "profile.project.create",
    failMessage: SAVE_FAILED,
    run: (ctx, data) => career.createProject(ctx, data).then(done),
  });
}

export async function updateProjectAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: updateOf(projectSchema),
    input,
    event: "profile.project.update",
    failMessage: SAVE_FAILED,
    run: (ctx, { id, values }) => career.updateProject(ctx, id, values).then(done),
  });
}

// --- Delete -------------------------------------------------------------------

export async function deleteProfileItemAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: deleteProfileItemSchema,
    input,
    event: "profile.item.delete",
    failMessage: "Could not delete. Try again.",
    run: (ctx, { kind, id }) => career.deleteProfileItem(ctx, kind, id).then(done),
  });
}

// --- Portfolio sync -------------------------------------------------------------

export async function syncFromPortfolioAction(): Promise<ActionResult<PortfolioSyncResult>> {
  return runAction({
    schema: z.undefined(),
    input: undefined,
    event: "profile.portfolio_sync.run",
    failMessage: "Portfolio sync failed. Try again.",
    run: (ctx) => syncFromPortfolio(ctx),
  });
}
