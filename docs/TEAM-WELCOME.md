# Team welcome onboarding

Staff now acknowledge a profile-derived welcome letter before the existing NDA gate. Admin and guest NDA behavior is unchanged. Administrators configure engagement type, role, rate/currency/basis, hours/period, optional start date and availability under Team > person > profile. Missing required details block staff onboarding. Existing staff also need acknowledgement. Changes affecting rendered letter content require acknowledgement again. Separate NDA acceptance remains required.

Freelance, contractor, full-time employee (FTE), part-time employee, volunteer and intern are available. Employee letters flag the separate contract requirement; contract generation/signing/enforcement is deferred and this feature does not mark a contract complete.

Acknowledgements store authenticated member ID, name, letter version, document hash, exact text, relevant profile snapshot and database timestamp. Server-only insert/select access protects append-only records. Failed persistence blocks progression.

## Database setup

Applied through the connected Supabase migration service as `20261124123203_team_welcome_acknowledgements`. RLS is enabled, client roles have no access, and the server role has insert/select access only. Joyce is configured as freelance, USD 7 per hour, 20 hours per week.
