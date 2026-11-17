/**
 * Supabase database types.
 *
 * TEMPORARY: hand-written subset covering the tables the app currently queries,
 * in the same shape `supabase gen types typescript` produces. Once the CLI is
 * logged in, replace this file with `pnpm db:types` output (see
 * docs/database/migrations.md). Keep it in sync with supabase/migrations until then.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Enums = {
  employment_type:
    | "full_time"
    | "part_time"
    | "contract"
    | "freelance"
    | "internship"
    | "temporary"
    | "other";
  remote_type: "remote" | "hybrid" | "onsite" | "unknown";
  salary_period: "hour" | "day" | "month" | "year";
  source_kind: "api" | "feed" | "career_page" | "manual";
  application_status:
    | "discovered"
    | "analyzing"
    | "qualified"
    | "drafting"
    | "pending_approval"
    | "approved"
    | "scheduled"
    | "applying"
    | "applied"
    | "failed"
    | "interview"
    | "assessment"
    | "rejected"
    | "withdrawn"
    | "archived";
  submission_method: "automation" | "manual";
  qualification_level: "high_priority" | "recommended" | "manual_review" | "archive";
  requirement_kind: "skill" | "experience" | "education" | "responsibility" | "other";
  document_kind:
    | "resume"
    | "cover_letter"
    | "application_email"
    | "resume_summary"
    | "recruiter_message"
    | "skills_emphasis";
  answer_source: "profile" | "ai" | "user";
  event_actor: "user" | "system" | "automation";
  assistant_role: "user" | "assistant";
  skill_category:
    | "language"
    | "framework"
    | "platform"
    | "database"
    | "cloud"
    | "tool"
    | "practice"
    | "other";
};

type Timestamps = { created_at: string; updated_at: string };
type OwnedRow = { id: string; user_id: string } & Timestamps;

type ProfileRow = {
  id: string;
  full_name: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  years_of_experience: number | null;
  portfolio_synced_at: string | null;
} & Timestamps;

/** Set on rows copied from the portfolio (see apply_portfolio_sync). */
type PortfolioLinked = { portfolio_ref: string | null };

type ProfileLinkRow = OwnedRow & PortfolioLinked & { label: string; url: string; sort_order: number };

type JobPreferencesRow = {
  user_id: string;
  desired_titles: string[];
  preferred_locations: string[];
  employment_types: Enums["employment_type"][];
  accepted_remote_types: Enums["remote_type"][];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_period: Enums["salary_period"];
  willing_to_relocate: boolean;
  notes: string | null;
} & Timestamps;

type AutomationSettingsRow = {
  user_id: string;
  is_enabled: boolean;
  is_paused: boolean;
  paused_at: string | null;
  paused_reason: string | null;
  timezone: string;
  working_days: number[];
  window_start: string;
  window_end: string;
  daily_application_limit: number;
  min_match_score: number;
  require_approval: boolean;
  max_retries: number;
  retry_backoff_minutes: number;
  scoring_weights: Json;
  notification_preferences: Json;
} & Timestamps;

type ProfessionalExperienceRow = OwnedRow & PortfolioLinked & {
  company: string;
  title: string;
  location: string | null;
  employment_type: Enums["employment_type"] | null;
  remote_type: Enums["remote_type"] | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  achievements: string[];
  technologies: string[];
  sort_order: number;
};

type ProfessionalSkillRow = OwnedRow & PortfolioLinked & {
  name: string;
  category: Enums["skill_category"];
  proficiency: number | null;
  years_of_experience: number | null;
  is_primary: boolean;
};

type EducationRow = OwnedRow & PortfolioLinked & {
  institution: string;
  degree: string | null;
  field_of_study: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  sort_order: number;
};

type CertificationRow = OwnedRow & {
  name: string;
  issuer: string | null;
  issued_on: string | null;
  expires_on: string | null;
  credential_url: string | null;
};

type ProjectRow = OwnedRow & PortfolioLinked & {
  name: string;
  role: string | null;
  description: string | null;
  url: string | null;
  repository_url: string | null;
  technologies: string[];
  highlights: string[];
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
};

type ResumeRow = OwnedRow & {
  name: string;
  target_category: string | null;
  summary: string | null;
  emphasized_skills: string[];
  storage_path: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  is_default: boolean;
};

type JobSourceRow = OwnedRow & {
  connector_key: string;
  name: string;
  kind: Enums["source_kind"];
  is_enabled: boolean;
  config: Json;
  last_synced_at: string | null;
  last_error: string | null;
};

type JobRow = OwnedRow & {
  source_id: string | null;
  external_id: string | null;
  url: string;
  dedupe_hash: string;
  title: string;
  company: string;
  location: string | null;
  remote_type: Enums["remote_type"];
  employment_type: Enums["employment_type"] | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: Enums["salary_period"] | null;
  description: string | null;
  posted_at: string | null;
  discovered_at: string;
};

/** Columns of `applications` the app reads (locks and idempotency keys are worker-only). */
type ApplicationRow = OwnedRow & {
  job_id: string;
  status: Enums["application_status"];
  priority: number;
  resume_id: string | null;
  match_score: number | null;
  approved_at: string | null;
  scheduled_for: string | null;
  submitted_at: string | null;
  submission_method: Enums["submission_method"] | null;
  attempt_count: number;
  last_error: string | null;
  notes: string | null;
};

type JobListingRow = {
  id: string;
  user_id: string;
  source_id: string | null;
  source_key: string | null;
  source_name: string | null;
  url: string;
  title: string;
  company: string;
  location: string | null;
  remote_type: Enums["remote_type"];
  employment_type: Enums["employment_type"] | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: Enums["salary_period"] | null;
  salary_upper: number | null;
  posted_at: string | null;
  discovered_at: string;
  application_id: string;
  status: Enums["application_status"];
  overall_score: number | null;
  qualification: Enums["qualification_level"] | null;
  evaluated_at: string | null;
};

type PromptVersionRow = {
  id: string;
  prompt_key: string;
  version: number;
  description: string | null;
  template: string;
  output_schema: Json | null;
  default_model: string;
  is_active: boolean;
  created_at: string;
};

type JobScoreRow = {
  id: string;
  user_id: string;
  job_id: string;
  overall_score: number;
  qualification: Enums["qualification_level"];
  criteria_scores: Json;
  criteria_weights: Json;
  matched_skills: string[];
  missing_skills: string[];
  experience_gaps: string[];
  positive_factors: string[];
  negative_factors: string[];
  explanation: string;
  model: string;
  prompt_version_id: string | null;
  input_hash: string | null;
  evaluated_at: string;
};

type JobRequirementRow = {
  id: string;
  user_id: string;
  job_id: string;
  kind: Enums["requirement_kind"];
  description: string;
  is_required: boolean;
  min_years: number | null;
  created_at: string;
};

type ApplicationDocumentRow = OwnedRow & {
  application_id: string;
  kind: Enums["document_kind"];
  version: number;
  title: string | null;
  content: string;
  storage_path: string | null;
  is_approved: boolean;
  model: string | null;
  prompt_version_id: string | null;
  source: Enums["answer_source"];
  grounding_flags: string[];
};

type ApplicationAnswerRow = OwnedRow & {
  application_id: string;
  question: string;
  answer: string;
  source: Enums["answer_source"];
  is_verified: boolean;
  model: string | null;
  prompt_version_id: string | null;
};

type AiUsageEventRow = {
  id: string;
  user_id: string;
  operation: string;
  model: string;
  prompt_version_id: string | null;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  estimated_cost_usd: number | null;
  latency_ms: number | null;
  succeeded: boolean;
  error_code: string | null;
  created_at: string;
};

type ApplicationEventRow = {
  id: string;
  user_id: string;
  application_id: string;
  event_type: string;
  from_status: Enums["application_status"] | null;
  to_status: Enums["application_status"] | null;
  actor: Enums["event_actor"];
  message: string | null;
  metadata: Json;
  created_at: string;
};

type AssistantThreadRow = OwnedRow & { title: string };

type AssistantMessageRow = {
  id: string;
  user_id: string;
  thread_id: string;
  role: Enums["assistant_role"];
  content: string;
  tools_used: string[];
  created_at: string;
};

/** Insert/Update helpers mirroring generated types: defaults become optional. */
type Writable<Row, Required extends keyof Row> = Pick<Row, Required> &
  Partial<Omit<Row, Required>>;

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Writable<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id">;
      profile_links: Table<ProfileLinkRow, "user_id" | "label" | "url">;
      job_preferences: Table<JobPreferencesRow, "user_id">;
      automation_settings: Table<AutomationSettingsRow, "user_id">;
      professional_experiences: Table<
        ProfessionalExperienceRow,
        "user_id" | "company" | "title" | "start_date"
      >;
      professional_skills: Table<ProfessionalSkillRow, "user_id" | "name">;
      education: Table<EducationRow, "user_id" | "institution">;
      certifications: Table<CertificationRow, "user_id" | "name">;
      projects: Table<ProjectRow, "user_id" | "name">;
      resumes: Table<ResumeRow, "user_id" | "name">;
      job_sources: Table<JobSourceRow, "user_id" | "connector_key" | "name" | "kind">;
      jobs: Table<JobRow, "user_id" | "url" | "dedupe_hash" | "title" | "company">;
      applications: Table<ApplicationRow, "user_id" | "job_id">;
      prompt_versions: Table<PromptVersionRow, "prompt_key" | "version" | "template" | "default_model">;
      job_scores: Table<JobScoreRow, "user_id" | "job_id" | "overall_score" | "qualification" | "criteria_scores" | "criteria_weights" | "explanation" | "model">;
      job_requirements: Table<JobRequirementRow, "user_id" | "job_id" | "kind" | "description">;
      ai_usage_events: Table<AiUsageEventRow, "user_id" | "operation" | "model" | "succeeded">;
      application_events: Table<ApplicationEventRow, "user_id" | "application_id" | "event_type" | "actor">;
      assistant_threads: Table<AssistantThreadRow, "user_id" | "title">;
      assistant_messages: Table<AssistantMessageRow, "user_id" | "thread_id" | "role" | "content">;
      application_documents: Table<ApplicationDocumentRow, "user_id" | "application_id" | "kind" | "content">;
      application_answers: Table<ApplicationAnswerRow, "user_id" | "application_id" | "question" | "answer" | "source">;
    };
    Views: {
      job_listings: { Row: JobListingRow; Relationships: [] };
    };
    Functions: {
      set_default_resume: { Args: { p_resume_id: string }; Returns: undefined };
      apply_portfolio_sync: { Args: { p_snapshot: Json }; Returns: Json };
      save_application_document: {
        Args: {
          p_application_id: string;
          p_kind: Enums["document_kind"];
          p_title: string | null;
          p_content: string;
          p_source: Enums["answer_source"];
          p_model: string | null;
          p_prompt_version_id: string | null;
          p_grounding_flags: string[];
        };
        Returns: number;
      };
      mark_application_ready: {
        Args: { p_application_id: string; p_confirm_flags: boolean };
        Returns: Enums["application_status"];
      };
      record_job_evaluation: {
        Args: { p_job_id: string; p_score: Json; p_requirements: Json; p_next_status: Enums["application_status"] };
        Returns: Enums["application_status"];
      };
      ingest_jobs: {
        Args: { p_source_id: string | null; p_jobs: Json };
        Returns: { inserted_count: number; skipped_count: number }[];
      };
      set_job_archived: {
        Args: { p_job_id: string; p_archived: boolean };
        Returns: Enums["application_status"];
      };
      approve_application: {
        Args: { p_application_id: string; p_submit_after: string | null };
        Returns: Enums["application_status"];
      };
      withdraw_approval: { Args: { p_application_id: string }; Returns: Enums["application_status"] };
      mark_application_submitted: { Args: { p_application_id: string }; Returns: Enums["application_status"] };
    };
    Enums: Enums;
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type DbEnum<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];

export type Views<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];
