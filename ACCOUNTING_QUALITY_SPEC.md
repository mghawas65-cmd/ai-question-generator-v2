# Accounting Quality Spec v2.0

## Request contract
Fields: content, type, difficulty, language, count, exam, framework, jurisdiction, asOf, toolContext, autoConfirmed.

Rules:
- content: 8–30,000 characters after control-character stripping.
- count: 10–30.
- framework=auto requires autoConfirmed=true.
- tax/zakat content requires non-global jurisdiction.
- asOf must be ISO YYYY-MM-DD.

## Generation pipeline
1. Validate and sanitize request.
2. Apply per-IP in-memory rate window.
3. Return exact-match cache hit when present.
4. Generate original questions in bounded concurrent batches.
5. Deterministic validation of structure and MCQ integrity.
6. Independent reviewer prompt in chunks of up to 8.
7. Reviewer checks correctness, ambiguity, numerical consistency, journal-entry logic, framework fit and citation confidence.
8. paragraph_reference is removed when reviewer confidence < 0.85.
9. De-duplicate by normalized question fingerprint.
10. Repair only if fewer than the minimum valid questions remain.
11. Cache successful result for 30 minutes.

## Question schema
- question
- choices
- answer
- explanation
- difficulty
- type
- topic
- reference
- paragraph_reference
- learning_objective
- bloom_level
- why_wrong
- verified
- verification_confidence
- verification_notes
- standard_as_of
- jurisdiction
- framework
- official_source

## Source policy
Application supplies only official/approved URLs by framework. Model output cannot choose arbitrary source URLs.
Exact paragraph numbers are not treated as authoritative merely because a model generated them.

## High-risk content
Tax, zakat, legal/regulatory, and newly amended standards must:
- declare jurisdiction,
- declare as-of date,
- show official source,
- remain training content, not professional advice.

## Privacy
Current release is local-first: question bank and test history are stored in browser localStorage. No cloud account synchronization exists yet.

## IP policy
Prompts require original questions and prohibit close imitation of recognizable proprietary exam-prep wording. The product must not imply endorsement by professional bodies or publishers.
