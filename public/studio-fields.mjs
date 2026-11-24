// The everyday editor shows content first. All other saved fields remain editable.
export const primaryFields = {
  theme:['introduction','body'],
  campaign:['headline','body','callToAction','assetIds'],
  communication:['subject','body'],
  article:['introduction','body','marginNote','takeaway'], learning:['body','takeaway'],
  lesson:['introduction','body','videoUrl','script','durationSeconds','takeaway','activity'],
  course:['introduction','outcome','audience','marketingCopy','introductionScript','heroImageUrl','heroImageAlt','heroImageCredit','welcomeEmail','socialCopy','lessonIds'],
  programme:['purpose','weeks','scheduleIds'],
  challenge:['introduction','outcome','weeks','programmeIds','recipeIds'],
  recipe:['imageUrl','servings','ingredients','instructions','prepMinutes','cookMinutes','nutrition'],
  mealplan:['introduction','days','shoppingList'],
  ebook:['coverUrl','introduction','chapters'],
  exercise:['instructions','cues','media'],
  activity:['type','notes','durationMinutes','distanceMetres','repetitions'],
  session:['introduction','duration','warmup','blocks','cooldown'],
  structure:['frequency','weeks'], stage:['description','weeks'],
  asset:['brief','body','url','altText'], leadmagnet:['headline','introduction','contentIds','callToAction'],
  workflow:['trigger','steps'], rule:['instructions','repeatWhen','progressWhen'], review:['questions','nextStep']
};
export const fieldLabels = {
  marketingCopy:'Marketing & landing page copy', introductionScript:'Introduction video script', introductionScriptTimingEstimateSeconds:'Estimated narration length (seconds)', productionNotes:'Production notes', heroImageUrl:'Hero image link', heroImageAlt:'Hero image description', heroImageCredit:'Hero image source / rights', welcomeEmail:'Welcome email', socialCopy:'Social launch copy',
  emailHtml:'HTML email', plainText:'Plain-text version', marginNote:'Image caption (Kalam)', body:'Content', headline:'Headline', callToAction:'Button or link text', assetIds:'Images and files', assetId:'File',
  lessonIds:'Lessons in order', lessonId:'Lesson', programmeIds:'Programmes', programmeId:'Programme',
  contentIds:'Included content', contentId:'Content', scheduleIds:'Weekly plans', scheduleId:'Weekly plan',
  recipeIds:'Recipes', recipeId:'Recipe', sessionIds:'Workouts', sessionId:'Workout', stageIds:'Stages', stageId:'Stage',
  repMin:'Minimum reps', repMax:'Maximum reps', referenceId:'Exercise or activity', restSeconds:'Rest (seconds)',
  effortValue:'Effort target', effortType:'Effort scale', perSide:'Per side',
  easierId:'Easier exercise', harderId:'Harder exercise', messageId:'Message', ruleId:'Rule',
  videoUrl:'Video link', thumbnailUrl:'Thumbnail link', imageUrl:'Image link', coverUrl:'Cover image link',
  sourceText:'Original source text', sourceRecordId:'Original reference', busyWeek:'Busy week option',
  warmup:'Warm-up', cooldown:'Cool-down', duration:'Duration (minutes)', durationSeconds:'Video length (seconds)',
  durationMinutes:'Duration (minutes)', prepMinutes:'Prep time (minutes)', cookMinutes:'Cooking time (minutes)',
  nutrition:'Nutrition per serving', script:'Voiceover script', media:'Video and thumbnail', blocks:'Exercises',
  durationDays:'Plan length in days', cookServings:'Portions to cook', leftoverFromDay:'Leftovers from day', imagePreference:'Recipe picture preference',
  audience:'Who it is for', channel:'Where it will be used', altText:'Image description'
};
export const fieldLabel = key => fieldLabels[key] || key.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase());
export const statusLabel = status => ({Approved:'Checked', 'In review':'Needs checking', 'Changes requested':'Needs changes'})[status] || status;
