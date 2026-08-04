<!--
Sync Impact Report
- Version: 0.0.0 -> 1.0.0
- Modified Principles:
  - Added I. Type Safety
  - Added II. Async & High Concurrency
  - Added III. Strict Branching Strategy
  - Added IV. Absolute Security & Stability
  - Added V. Low Coupling
  - Added VI. 100% Test Coverage
- Added sections: Branching & Workflow, Security & Testing Standards
- Removed sections: N/A
- Templates requiring updates: 
  - .specify/templates/plan-template.md: ✅ updated
  - .specify/templates/spec-template.md: ✅ updated
  - .specify/templates/tasks-template.md: ✅ updated
-->

# NTUT Exam System Constitution
<!-- The core constitution for the NTUT Exam System project -->

## Core Principles

### I. Type Safety
The project MUST be strictly type-safe under all circumstances. Unsafe typing or dynamic typing that bypasses the compiler/interpreter safety checks MUST NOT be used.

### II. Async & High Concurrency
The system MUST implement robust asynchronous processing. As an exam system, it will experience traffic spikes; therefore, it MUST be capable of handling high concurrency requests gracefully without performance degradation.

### III. Strict Branching Strategy
The repository MUST strictly adhere to the following branch separation: `main` (production), `develop` (integration), and `feat/XXX` (feature development). Direct commits to `main` or `develop` are strictly prohibited.

### IV. Absolute Security & Stability
Stability and security are the highest priorities. The backend MUST be absolutely secure against common vulnerabilities (e.g., SQLi, XSS, unauthorized access) and ensure data integrity at all times.

### V. Low Coupling
The codebase MUST maintain low coupling and high cohesion. Components should be isolated to facilitate easy testing and independent maintainability.

### VI. 100% Test Coverage
Every single line of code MUST pass tests. Comprehensive unit, integration, and security tests are non-negotiable requirements before any code can be merged.

## Branching & Workflow

All development MUST occur on `feat/XXX` branches.
Code is merged into `develop` for integration testing and staging.
Code is only merged into `main` for production releases.
Code reviews MUST verify that branches follow this naming and workflow convention.

## Security & Testing Standards

Due to the nature of an examination system, there is zero tolerance for data breaches or system downtime during exams. 
Testing is NOT optional. 100% line coverage is the target standard, and security audits MUST be part of the continuous integration pipeline.

## Governance

All Pull Requests MUST be reviewed against this Constitution. Any code that is not fully typed, lacks 100% test coverage, or introduces security vulnerabilities MUST be rejected. Versioning follows Semantic Versioning for any constitutional changes.

**Version**: 1.0.0 | **Ratified**: 2026-08-04 | **Last Amended**: 2026-08-04

<!-- Knowie: Project Knowledge -->
## Project Knowledge

This project maintains structured knowledge in `knowledge/`:

- **Principles** (`knowledge/principles.md`): Core axioms and derived development principles — the project's non-negotiable rules.
- **Vision** (`knowledge/vision.md`): Goals, current state, architecture decisions, and roadmap.
- **Experience** (`knowledge/experience.md`): Distilled lessons from past development — patterns, pitfalls, and takeaways.

Read these files at the start of any task to understand the project's *why* and constraints.
Additional context may be found in `knowledge/concepts/`, `knowledge/history/`, and `knowledge/draft/`.

Learned procedures live in `knowledge/skills/` (agentskills.io SKILL.md format). If your tool auto-loads skills, they may be projected into your skill directory; otherwise read the relevant `SKILL.md` there and follow it.
<!-- /Knowie -->
