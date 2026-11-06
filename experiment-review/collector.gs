// Deploy as a standalone Apps Script web app. Set SPREADSHEET_ID and CLASS_CODE
// in Project Settings > Script Properties. Never publish student data in GitHub.
function doGet(){return HtmlService.createHtmlOutput(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px system-ui;max-width:640px;margin:40px auto;padding:20px}input,button{font:inherit;padding:12px;margin:12px 0;display:block}button{background:#234b3c;color:white;border:0;border-radius:8px}</style><h1>Hand in your experiment record</h1><p>Choose the JSON file downloaded from your lab. Wait for the receipt before closing this page.</p><label>Class submission code<input id="code" maxlength="80"></label><input id="file" type="file" accept=".json"><button id="send">Submit record</button><p id="status" role="status"></p><script>
const button=document.getElementById('send'),status=document.getElementById('status');button.onclick=async()=>{const file=document.getElementById('file').files[0];if(!file||file.size>500000){status.textContent='Choose a JSON file under 500 KB.';return;}button.disabled=true;status.textContent='Sending…';try{const raw=await file.text();google.script.run.withSuccessHandler(r=>{status.textContent='Received. Receipt: '+r.receipt+' · '+r.tests+' experiments. You may close this page.';button.disabled=false;}).withFailureHandler(e=>{status.textContent='Not received: '+e.message+'. Your downloaded file is safe. Retry submission.';button.disabled=false;}).receiveRecord(raw,document.getElementById('code').value);}catch(e){status.textContent=e.message;button.disabled=false;}};</script>`);}
function receiveRecord(raw,code){
 const config=PropertiesService.getScriptProperties();if(!config.getProperty('CLASS_CODE')||code!==config.getProperty('CLASS_CODE'))throw Error('Incorrect class submission code.');
 if(typeof raw!=='string'||raw.length>500000)throw Error('File too large.');const d=JSON.parse(raw);
 if(d.format!=='classroom-experiments'||d.version!==1||typeof d.id!=='string'||d.id.length>80||typeof d.classCode!=='string'||d.classCode.length>40||typeof d.student!=='string'||d.student.length>40||!Array.isArray(d.runs)||d.runs.length>2000)throw Error('Invalid record.');
 const seen=Object.create(null);d.runs.forEach(r=>{if(!r||typeof r.id!=='string'||seen[r.id]||!['race','balance'].includes(r.mode)||!r.setup||!r.result||typeof r.result.time!=='number'||!isFinite(r.result.time)||r.result.time<0)throw Error('Invalid experiment.');seen[r.id]=true;});
 if(d.final&&(!seen[d.final.runId]||typeof d.final.reason!=='string'||!d.final.reason.trim()||d.final.reason.length>500))throw Error('Invalid final choice.');
 const digest=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw));const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{const ss=SpreadsheetApp.openById(config.getProperty('SPREADSHEET_ID'));let receipts=ss.getSheetByName('Receipts');if(!receipts){receipts=ss.insertSheet('Receipts');receipts.appendRow(['Receipt','Received at','Class','Student','Session','Tests','Final test','Reason']);receipts.setFrozenRows(1);}
 if(receipts.getLastRow()>1&&receipts.getRange(2,1,receipts.getLastRow()-1,1).createTextFinder(digest).matchEntireCell(true).findNext())return {receipt:digest,tests:d.runs.length};
 let data=ss.getSheetByName('Record data');if(!data){data=ss.insertSheet('Record data');data.appendRow(['Receipt','Chunk','JSON']);}
 // Full record is retained in chunks below the spreadsheet cell size limit.
 // Replace partial chunks on retry before writing the receipt last.
 for(let row=data.getLastRow();row>=2;row--)if(data.getRange(row,1).getValue()===digest)data.deleteRow(row);
 const chunks=[];for(let i=0;i<raw.length;i+=30000)chunks.push([digest,chunks.length+1,safeCell(raw.slice(i,i+30000))]);if(chunks.length)data.getRange(data.getLastRow()+1,1,chunks.length,3).setValues(chunks);
 updateLatest_(ss,d,digest);
 receipts.appendRow([digest,new Date(),safeCell(d.classCode),safeCell(d.student),safeCell(d.id),d.runs.length,d.final?d.runs.findIndex(r=>r.id===d.final.runId)+1:'',safeCell(d.final?.reason||'')]);SpreadsheetApp.flush();return {receipt:digest,tests:d.runs.length};
 }finally{lock.releaseLock();}
}
function safeCell(value){const s=String(value);return /^[\s]*[=+@-]/.test(s)?"'"+s:s;}

// Run once in the Apps Script editor, never from a student browser.
function initializeTeacher_(){
 const p=PropertiesService.getScriptProperties();
 if(!p.getProperty('SPREADSHEET_ID')){const ss=SpreadsheetApp.create('Classroom experiment records');p.setProperty('SPREADSHEET_ID',ss.getId());}
 if(!p.getProperty('CLASS_CODE'))p.setProperty('CLASS_CODE',Utilities.getUuid().replace(/-/g,'').slice(0,12));
 console.log('Private spreadsheet: https://docs.google.com/spreadsheets/d/'+p.getProperty('SPREADSHEET_ID')+'/edit');
 console.log('Class submission code: '+p.getProperty('CLASS_CODE'));
}
function doPost(e){
 const a=e.parameter||{},origin='https://raymond2z.github.io';
 if(a.returnOrigin!==origin||!/^[-\w]{16,80}$/.test(a.request||''))return HtmlService.createHtmlOutput('Invalid request.');
 let answer={type:'classroom-receipt',request:a.request,ok:false};
 try{const r=receiveRecord(a.raw,a.code);answer.ok=true;answer.receipt=r.receipt;answer.tests=r.tests;}catch(error){answer.error='Record not received.';}
 const data=JSON.stringify(answer).replace(/</g,'\\u003c');
 return HtmlService.createHtmlOutput('<!doctype html><script>window.top.postMessage('+data+','+JSON.stringify(origin)+');</script>')
 .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function updateLatest_(ss,d,receipt){
 let sheet=ss.getSheetByName('Latest students');
 if(!sheet){sheet=ss.insertSheet('Latest students');sheet.appendRow(['Session','Class','Student','Last saved at','Experiments','Final test','Reason','Receipt','Final mode','Final setup']);sheet.setFrozenRows(1);}
 const saved=Date.parse(d.updatedAt)||Date.parse(d.final?.createdAt)||Date.parse(d.runs.at(-1)?.createdAt)||Date.now();
 let row=sheet.getLastRow()+1;
 if(sheet.getLastRow()>1){const hit=sheet.getRange(2,1,sheet.getLastRow()-1,1).createTextFinder(d.id).matchEntireCell(true).findNext();
 if(hit){row=hit.getRow();const old=sheet.getRange(row,1,1,10).getValues()[0];if(Number(old[4])>d.runs.length||Date.parse(old[3])>saved)return;}}
 const final=d.final?d.runs.find(r=>r.id===d.final.runId):null;
 sheet.getRange(row,1,1,10).setValues([[safeCell(d.id),safeCell(d.classCode),safeCell(d.student),new Date(saved).toISOString(),d.runs.length,final?d.runs.indexOf(final)+1:'',safeCell(d.final?.reason||''),receipt,final?.mode||'',final?JSON.stringify(final.setup):'']]);
}
