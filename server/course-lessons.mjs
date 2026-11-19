import {esc,link} from './library-shelves.mjs';
export function videoLength(seconds){
 if(!Number.isFinite(seconds)||seconds<=0)return '';
 const total=Math.round(seconds);return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');
}
export const courseLessons=course=>(course.sections||[]).flatMap(section=>section.entries||[]);
export function lessonAssetLink(courseId,entry,label='Script & video'){
 return '<a class="asset-link" href="'+link({work:'1',assets:courseId,lesson:entry.key})+'">'+esc(label)+'</a>';
}
export function lessonSummary(entry){
 return '<small class="course-lesson-meta">'+[
  videoLength(entry.videoSeconds)?'Original video '+videoLength(entry.videoSeconds):'',
  entry.scriptAvailable?'Script available':'',
  entry.canvaAvailable===false?'Canva link needs checking':''
 ].filter(Boolean).map(esc).join(' · ')+'</small>';
}
export function scriptCopy(lesson){
 return lesson.script?'<section><h2>Narration script</h2><p>Script available to copy for ElevenLabs.</p><button type="button" data-course-script-copy>Copy script</button><span data-course-copy-status role="status" aria-live="polite"></span><textarea data-course-script hidden aria-hidden="true">'+esc(lesson.script)+'</textarea></section><script src="/course-narration.js" type="module"></script>':'<p>The narration script has not been found.</p>';
}
