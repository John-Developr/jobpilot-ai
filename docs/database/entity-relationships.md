# Entity relationships

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : has
  AUTH_USERS ||--|| JOB_PREFERENCES : has
  AUTH_USERS ||--|| AUTOMATION_SETTINGS : has
  AUTH_USERS ||--o{ PROFILE_LINKS : owns
  AUTH_USERS ||--o{ PROFESSIONAL_EXPERIENCES : owns
  AUTH_USERS ||--o{ PROFESSIONAL_SKILLS : owns
  AUTH_USERS ||--o{ EDUCATION : owns
  AUTH_USERS ||--o{ CERTIFICATIONS : owns
  AUTH_USERS ||--o{ PROJECTS : owns
  AUTH_USERS ||--o{ RESUMES : owns
  AUTH_USERS ||--o{ JOB_SOURCES : configures
  JOB_SOURCES |o--o{ JOBS : discovers
  JOBS ||--o{ JOB_REQUIREMENTS : lists
  JOBS ||--o{ JOB_SCORES : "evaluated by"
  JOBS ||--o| APPLICATIONS : "tracked as"
  RESUMES |o--o{ APPLICATIONS : "submitted with"
  APPLICATIONS ||--o{ APPLICATION_DOCUMENTS : has
  APPLICATIONS ||--o{ APPLICATION_ANSWERS : has
  APPLICATIONS ||--o{ APPLICATION_EVENTS : "audited by"
  APPLICATIONS |o--o{ AUTOMATION_RUNS : "executed by"
  JOB_SOURCES |o--o{ AUTOMATION_RUNS : "synced by"
  PROMPT_VERSIONS |o--o{ JOB_SCORES : produced
  PROMPT_VERSIONS |o--o{ APPLICATION_DOCUMENTS : produced
  PROMPT_VERSIONS |o--o{ APPLICATION_ANSWERS : produced
  PROMPT_VERSIONS |o--o{ AI_USAGE_EVENTS : "billed to"
  AUTH_USERS ||--o{ NOTIFICATIONS : receives
  AUTH_USERS ||--o{ INTEGRATION_CONNECTIONS : owns
```

## Delete behavior

| Parent deleted | Effect |
| --- | --- |
| auth user | Everything owned by the user is deleted (cascade) |
| job | Requirements, scores, application, documents, answers, events deleted |
| application | Documents, answers, events deleted; `automation_runs.application_id` set null (run history kept) |
| job source | `jobs.source_id` and `automation_runs.job_source_id` set null (jobs kept) |
| resume | `applications.resume_id` set null |
| prompt version | Blocked (`restrict`) while any output references it — prompts are retired with `is_active = false`, never deleted |

Composite FKs `(x_id, user_id)` guarantee both rows belong to the same user.
