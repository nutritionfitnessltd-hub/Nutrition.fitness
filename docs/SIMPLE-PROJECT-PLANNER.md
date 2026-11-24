# Simple project planning

Tasks ask for a title, assignee, estimated hours, checkbox prerequisites and optional deadline. Notes and programme-specific details remain available. Existing task approval permissions remain in force; "Ready for review" is labelled "Needs review" in task forms.

The planner uses agreed hours from team profiles. Weekly capacity is spread evenly across Monday-Friday; monthly hours are normalised using 12/52. Missing capacity or effort produces an actionable planning prompt, not a guessed date. Bank holidays, leave and custom working-day patterns are not yet modelled. Profile availability prose is not parsed as a calendar.

All active projects share one daily capacity ledger per person. In-progress tasks are allocated first; remaining tasks use earliest deadline then stable project/task ordering. Independent tasks can share spare daily hours. Prerequisites complete before a successor begins on the next working day. Completed projects and completed tasks consume no future capacity. Milestones consume no work hours. Review queues have no promised finish until approval; successors show why they cannot yet be forecast.

Expected dates are derived when a project opens and refresh after saving. Deadlines are stored commitments and are never replaced by computed dates, including in the browser. In-progress work uses entered hours left; otherwise the estimate remains the planning input until updated. Legacy day estimates are interpreted using the assigned person's daily capacity until replaced with hours.

The service reads portfolio scheduling data privately and renders only authorised project rows. Other project names, notes and assignments are not included in forms. If the workload service fails, the UI reports planning unavailable rather than showing a partial forecast. The schedule is a deterministic working-day forecast, not a time-of-day appointment calendar; allocations beyond three years are left unscheduled with a prompt to split the task.

Validation: 53 focused project/scheduling tests; browser fixture verifies checkbox counts, persisted hours and prerequisites, recalculated forecasts, unchanged deadlines and risk flags. Full suite: 791 passed, 14 failed. The same 14 failures reproduced against unchanged production source a85a03a (homepage parsing and existing content/worker UI expectations).
