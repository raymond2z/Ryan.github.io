// Deploy as a standalone Apps Script web app. Set SPREADSHEET_ID and CLASS_CODE
// in Project Settings > Script Properties. Never publish student data in GitHub.
function doGet(){return HtmlService.createHtmlOutput(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px system-ui;max-width:640px;margin:40px auto;padding:20px}input,button{font:inherit;padding:12px;margin:12px 0;display:block}button{background:#234b3c;color:white;border:0;border-radius:8px}</style><h1>Hand in your experiment record</h1><p>Choose the JSON file downloaded from your lab. Wait for the receipt before closing this page.</p><label>Class submission code<input id="code" maxlength="80"></label><input id="file" type="file" accept=".json"><button id="send">Submit record</button><p id="status" role="status"></p><script>
const button=document.getElementById('send'),status=document.getElementById('status');button.onclick=async()=>{const file=document.getElementById('file').files[0];if(!file||file.size>500000){status.textContent='Choose a JSON file under 500 KB.';return;}button.disabled=true;status.textContent='Sending…';try{const raw=await file.text();google.script.run.withSuccessHandler(r=>{status.textContent='Received. Receipt: '+r.receipt+' · '+r.tests+' experiments. You may close this page.';button.disabled=false;}).withFailureHandler(e=>{status.textContent='Not received: '+e.message+'. Your downloaded file is safe. Retry submission.';button.disabled=false;}).receiveRecord(raw,document.getElementById('code').value);}catch(e){status.textContent=e.message;button.disabled=false;}};</script>`);}
function receiveRecord(raw,code){
 const config=PropertiesService.getScriptProperties();if(!config.getProperty('CLASS_CODE')||code!==config.getProperty('CLASS_CODE'))throw Error('Incorrect class submission code.');
 if(typeof raw!=='string'||raw.length>500000)throw Error('File too large.');const d=JSON.parse(raw);
 if(d.format!=='classroom-experiments'||d.version!==1||typeof d.id!=='string'||d.id.length>80||typeof d.classCode!=='string'||d.classCode.length>40||typeof d.student!=='string'||d.student.length>40||!Array.isArray(d.runs)||d.runs.length>2000)throw Error('Invalid record.');
 const seen={};d.runs.forEach(r=>{if(!r||typeof r.id!=='string'||seen[r.id]||!['race','balance'].includes(r.mode)||!r.setup||!r.result||typeof r.result.time!=='number'||!isFinite(r.result.time)||r.result.time<0)throw Error('Invalid experiment.');seen[r.id]=true;});
 if(d.final&&(!seen[d.final.runId]||typeof d.final.reason!=='string'||!d.final.reason.trim()||d.final.reason.length>500))throw Error('Invalid final choice.');
 const digest=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw));const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{const ss=SpreadsheetApp.openById(config.getProperty('SPREADSHEET_ID'));let receipts=ss.getSheetByName('Receipts');if(!receipts){receipts=ss.insertSheet('Receipts');receipts.appendRow(['Receipt','Received at','Class','Student','Session','Tests','Final test','Reason']);receipts.setFrozenRows(1);}
 if(receipts.getLastRow()>1&&receipts.getRange(2,1,receipts.getLastRow()-1,1).createTextFinder(digest).matchEntireCell(true).findNext())return {receipt:digest,tests:d.runs.length};
 let data=ss.getSheetByName('Record data');if(!data){data=ss.insertSheet('Record data');data.appendRow(['Receipt','Chunk','JSON']);}
 // Full record is retained in chunks below the spreadsheet cell size limit.
 // Replace partial chunks on retry before writing the receipt last.
 for(let row=data.getLastRow();row>=2;row--)if(data.getRange(row,1).getValue()===digest)data.deleteRow(row);
 const chunks=[];for(let i=0;i<raw.length;i+=30000)chunks.push([digest,chunks.length+1,safeCell(raw.slice(i,i+30000))]);if(chunks.length)data.getRange(data.getLastRow()+1,1,chunks.length,3).setValues(chunks);
 receipts.appendRow([digest,new Date(),safeCell(d.classCode),safeCell(d.student),safeCell(d.id),d.runs.length,d.final?d.runs.findIndex(r=>r.id===d.final.runId)+1:'',safeCell(d.final?.reason||'')]);SpreadsheetApp.flush();return {receipt:digest,tests:d.runs.length};
 }finally{lock.releaseLock();}
}
function safeCell(value){const s=String(value);return /^[\s]*[=+@-]/.test(s)?"'"+s:s;}
