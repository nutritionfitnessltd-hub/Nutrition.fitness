# Task messages and email

Every project task and work assignment has a private discussion at `studio=task`, linked from Projects, My work, assignments and Team work. The assignee, project owner, assigning person and administrators can read and post. Staff require Work access; Content Library access and content editing are not required to discuss a task. Existing status-update and task-review permissions are preserved.

Messages use independent versioned records in the existing private studio store. They cannot be edited through the generic content editor and are excluded from library, search and export loads. Threads follow the task identity across reassignment and restore. Deleted or inaccessible tasks cannot be used to read their thread. Concurrent posts report a conflict and retain the unsent text; message IDs protect against duplicate submissions. The reader shows up to 25 messages at once with older/newer navigation.

Connections has a separate **Email task assignments, messages and status changes** setting. It does not enable content-review email. Assignment/reassignment emails go to the assignee; status changes and new messages go to the other task participants. The person taking the action is excluded. Emails link to the authenticated task rather than copying the conversation into email.

Notifications use the existing Microsoft 365 sender and versioned delivery log. They are generated only after the task or message write succeeds. Event keys and delivery claims prevent duplicate sends. Failed email never rolls back saved work; administrators can inspect and retry confirmed failures in Connections. Uncertain deliveries are not automatically retried. Enabling notifications does not send historical assignment emails.

Coverage includes project creation, adding/linking/restoring/reassigning tasks, status changes, standalone assignments, approved-content handoffs, and the older assignment/project forms. No schema migration is required. Local verification uses fictional records and a mocked mail service: `node tests/task-messaging-preview.mjs`.
