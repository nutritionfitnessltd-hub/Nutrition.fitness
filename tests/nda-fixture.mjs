import {createHash} from 'node:crypto';
export const ndaVersion='test-v1';
export const ndaText='Fixture agreement for automated tests only. These are not legal terms.';
export const ndaHash=createHash('sha256').update(ndaText).digest('hex');
export const ndaDocument={version:ndaVersion,document_text:ndaText,document_hash:ndaHash};

// Existing feature fixtures represent members who completed welcome onboarding.
export function welcomeFixture(path){
 if(path.includes('nufi_studio_items')&&decodeURIComponent(path).includes('id=eq.studio:team-profile:'))return [{payload:{fields:{role:'Editor',engagementType:'freelance',rate:'7',currency:'USD',rateBasis:'hour',agreedHours:'20',hoursPeriod:'week'}}}];
 if(path.includes('nufi_team_welcome_acknowledgements'))return [{id:'fixture-welcome'}];
}
