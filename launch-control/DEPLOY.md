# Deploy Nutrition.Fitness Launch Control

Deploy this directory as a separate Vercel project.

- Root Directory: `launch-control`
- Framework preset: Other
- Build command: none
- Output directory: `.`
- Production branch: `launch-control-app` while the tool is being tested
- Suggested domain after approval: `ops.nutrition.fitness`

The current prototype stores changes in browser localStorage so the UI can be reviewed safely without touching production customer data. The included `launch_control_schema.sql` is the shared-data model for Supabase; connect a dedicated Supabase project before inviting the team to use assignments and submissions across devices.
