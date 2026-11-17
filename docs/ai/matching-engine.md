# Matching engine

Status: **Implemented (Phase 4)** for job evaluation (`job.evaluate`); document generation is Phase 5.

## Criteria

| Criterion | Weight | Inputs | Scored by |
| --- | --- | --- | --- |
| Technical skills | 30 | Job skills vs `professional_skills` (+ years, proficiency) | AI with explicit matched/missing lists; matched skills are filtered to the verified profile |
| Experience | 20 | Required years/seniority vs experiences | AI |
| Responsibilities | 20 | Job duties vs experience descriptions/achievements | AI |
| Remote compatibility | 15 | `jobs.remote_type`, location vs `accepted_remote_types`, relocation | Deterministic rules |
| Salary compatibility | 10 | Job range vs preferred range (same currency/period) | Deterministic; unknown salary = neutral 50 |
| Employment type | 5 | Job type vs preferred types | Deterministic |

`overall = round(Σ score_i × weight_i / Σ weight_i)` — computed in code, never by the model.

## Qualification

| Score | Level | Default action |
| --- | --- | --- |
| 85–100 | `high_priority` | `qualified` if ≥ `min_match_score`; priority = score (notifications arrive in Phase 8) |
| 70–84 | `recommended` | `qualified` if ≥ `min_match_score`, else stays `discovered` |
| 55–69 | `manual_review` | Stays `discovered` for manual review (never auto-qualified) |
| < 55 | `archive` | `archived` (reversible by the user) |

No job is discarded on an unexplained judgement: every score stores the explanation, matched/missing skills,
experience gaps and positive/negative factors, and archived jobs remain visible and restorable.

## Re-evaluation

Each score stores an `input_hash` (SHA-256 of prompt version, model, verified profile facts, job facts,
preferences, weights and minimum score). "Score match" reuses the latest score when the hash is unchanged;
"Re-score" forces a new call. Status changes only while the application is discovered/analyzing/qualified.
