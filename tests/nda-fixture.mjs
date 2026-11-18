import {createHash} from 'node:crypto';
export const ndaVersion='test-v1';
export const ndaText='Fixture agreement for automated tests only. These are not legal terms.';
export const ndaHash=createHash('sha256').update(ndaText).digest('hex');
export const ndaDocument={version:ndaVersion,document_text:ndaText,document_hash:ndaHash};
