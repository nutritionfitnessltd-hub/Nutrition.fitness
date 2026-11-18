import {createHash} from 'node:crypto';
import {HttpError,text} from './platform.mjs';
import {esc} from './library-shelves.mjs';

export function identityImage(value){
 if(typeof value!=='string'||value.length>2800000||!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new HttpError(400,'Upload a clear JPG, PNG or WebP photo of your ID.');
 const bytes=Buffer.from(value.slice(value.indexOf(',')+1),'base64');
 if(bytes.length<30||bytes.length>2000000||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'||bytes.readUInt32LE(4)+8!==bytes.length)throw new HttpError(400,'The ID image could not be read. Please choose another photo.');
 const chunk=bytes.toString('ascii',12,16);let width,height;
 if(chunk==='VP8X'){width=bytes.readUIntLE(24,3)+1;height=bytes.readUIntLE(27,3)+1;}
 else if(chunk==='VP8 '&&bytes.toString('hex',23,26)==='9d012a'){width=bytes.readUInt16LE(26)&16383;height=bytes.readUInt16LE(28)&16383;}
 else if(chunk==='VP8L'&&bytes[20]===47){const bits=bytes.readUInt32LE(21);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
 if(!width||!height||width<200||height<200||Math.max(width,height)<500||width>2400||height>2400)throw new HttpError(400,'Choose a clear, larger photo of the whole ID document.');
 return {data:value,bytes,hash:createHash('sha256').update(bytes).digest('hex')};
}
export function signatureStrokes(value){
 let strokes;try{strokes=typeof value==='string'&&value.length<100000?JSON.parse(value):value;}catch{}
 if(!Array.isArray(strokes)||!strokes.length||strokes.length>40)throw new HttpError(400,'Draw your signature or choose Type signature.');
 let count=0,minX=720,maxX=0,minY=180,maxY=0;
 for(const stroke of strokes){
  if(!Array.isArray(stroke)||stroke.length<2||stroke.length>1000)throw new HttpError(400,'Please redraw your signature.');
  count+=stroke.length;
  for(const point of stroke){
   if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||point[0]<0||point[0]>720||point[1]<0||point[1]>180)throw new HttpError(400,'Please redraw your signature.');
   minX=Math.min(minX,point[0]);maxX=Math.max(maxX,point[0]);minY=Math.min(minY,point[1]);maxY=Math.max(maxY,point[1]);
  }
 }
 if(count>3000||maxX-minX<20||maxY-minY<5)throw new HttpError(400,'Please add your full signature, rather than a dot or straight line.');
 return strokes.map(stroke=>stroke.map(point=>point.map(n=>Math.round(n*10)/10)));
}
export function signedDetails(fields,fullName){
 const street=text(fields.address_line,'your street address',240),city=text(fields.address_city,'your town or city',120),country=text(fields.address_country,'your country',80);
 const postcode=fields.address_postcode?text(fields.address_postcode,'your postcode or ZIP',32):'';
 const postal_address=[street,city,postcode,country].filter(Boolean).join('\n');
 const method=fields.signature_method;
 if(!['drawn','typed'].includes(method))throw new HttpError(400,'Choose how to sign the agreement.');
 const signature_name=method==='typed'?text(fields.signature_name,'your signature',120):fullName;
 if(method==='typed'&&signature_name.toLocaleLowerCase().replace(/\s+/g,' ')!==fullName.toLocaleLowerCase().replace(/\s+/g,' '))throw new HttpError(400,'Type your full name in the signature field exactly as entered above.');
 const signature_strokes=method==='drawn'?signatureStrokes(fields.signature_strokes):null;
 const image=identityImage(fields.identity_image);
 return {signed_details:true,postal_address,signature_method:method,signature_name,signature_strokes,identity_image:image.data,identity_sha256:image.hash,identity_received:true};
}
export function signatureMarkup(record){
 if(record.signature_method==='typed')return '<p class="nda-typed-signature">'+esc(record.signature_name)+'</p>';
 if(record.signature_method!=='drawn')return '<p>Electronic acceptance by typed full name.</p>';
 const strokes=signatureStrokes(record.signature_strokes);
 return '<svg class="nda-signed-mark" viewBox="0 0 720 180" role="img" aria-label="Recorded handwritten signature"><title>Recorded handwritten signature</title>'+strokes.map(s=>'<polyline fill="none" stroke="#103441" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="'+s.map(p=>p.join(',')).join(' ')+'"/>').join('')+'</svg>';
}
export function detailsForm(fields){
 const field=(key,label,max,required=true)=>'<label>'+label+'<input name="'+key+'" maxlength="'+max+'" '+(required?'required':'')+' value="'+esc(typeof fields[key]==='string'?fields[key]:'')+'"></label>';
 return '<fieldset class="nda-fields"><legend>Your address</legend>'+field('address_line','Street address',240)+field('address_city','Town or city',120)+field('address_postcode','Postcode / ZIP (if applicable)',32,false)+field('address_country','Country',80)+'</fieldset><fieldset class="nda-fields"><legend>Your signature</legend><label>Signature method<select name="signature_method"><option value="drawn">Draw signature</option><option value="typed">Type signature</option></select></label><div data-nda-draw><p>Sign using your mouse, finger or pen.</p><canvas class="nda-signature-pad" width="720" height="180" aria-label="Draw your signature here"></canvas><button type="button" data-nda-clear>Clear signature</button><input type="hidden" name="signature_strokes"></div><label data-nda-type hidden>Type your full name as your signature<input name="signature_name" maxlength="120" autocomplete="off"></label></fieldset><fieldset class="nda-fields"><legend>Proof of identity</legend><p>Upload a clear photo of your passport photo page or driving licence. JPG, PNG or WebP, up to 12 MB. Make sure your name and photo are readable.</p><label class="nda-id-drop" data-nda-drop>Choose an ID photo or drop it here<input type="file" accept="image/jpeg,image/png,image/webp" data-nda-id></label><input type="hidden" name="identity_image"><p data-nda-upload-status role="status" aria-live="polite">No ID uploaded.</p><img data-nda-id-preview alt="Your selected identity document" hidden><button type="button" data-nda-remove-id hidden>Remove selected photo</button><p class="meta">Your ID is stored privately with this agreement. Only you and workspace administrators can open it. Supplying a document does not mean your identity has been verified. An administrator can remove the ID image while keeping the signed agreement.</p></fieldset><noscript><p>Enable JavaScript to upload your ID and sign this agreement.</p></noscript>';
}
