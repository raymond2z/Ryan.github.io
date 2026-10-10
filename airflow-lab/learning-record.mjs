// Learning evidence checks concern recorded work, never scientific correctness.
export const REPEAT_RESPONSES={similar:'The wake looked similar',different:'The wake looked different',unsure:"I'm not sure yet"};
const written=value=>typeof value==='string'&&value.trim().length>0;
export function learningChecks({records=[],prediction='',conclusion='',fairReviewed=false,repeatResult=''}={}){
  const pair=records.length===2;
  const checks=[
    {key:'prediction',label:'Prediction recorded',done:written(prediction),next:'Predict before saving A in your next test.'},
    {key:'views',label:'A and B saved',done:pair,next:'Save A and B to compare them.'},
    {key:'observations',label:'An observation for A and B',done:pair&&records.every(r=>written(r.note)),next:'Describe what you see in A and B. Short phrases are enough.'},
    {key:'conditions',label:'Comparison settings reviewed',done:pair&&fairReviewed===true,next:'Read the comparison settings, then tick the review box.'},
    {key:'explanation',label:'Explanation recorded',done:written(conclusion),next:'Explain using something you saw. You can say you need more testing.'}
  ];
  if(pair&&records.every(r=>r.comparison?.repeated))checks.push({key:'repeat',label:'Repeat result recorded',done:Object.hasOwn(REPEAT_RESPONSES,repeatResult),next:'Choose whether the repeat looked similar, different or uncertain.'});
  return checks;
}

const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const answer=value=>written(value)?escape(value):'<span class="missing">Not recorded</span>';
const image=value=>typeof value==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/=\r\n]+$/.test(value)?`<img src="${escape(value)}" alt="Saved flow view">`:'';
const number=value=>Number.isFinite(value)?String(value):'Not recorded';
function renderRound(record,labels){
  const {records,prediction,conclusion,fairReviewed,repeatResult,differences=[]}=record;
  const round=records[0]?.comparison?.round;
  const checks=learningChecks(record);
  return `<section class="round"><h2>${round?'Round '+escape(round):'A/B test'} · ${escape(record.title)}</h2>
    <h3>1. My prediction</h3><p class="answer">${answer(prediction)}</p>
    <h3>2. What I observed</h3><div class="views">${records.map((r,i)=>`<figure><figcaption><b>View ${i?'B':'A'} · ${escape(labels[r.shape]??r.shape)}</b></figcaption>${image(r.image)}<p class="answer">${answer(r.note)}</p>
      <p class="settings">Wind ${escape(number(r.speed))} · Viscosity ${escape(number(r.viscosity))} · Angle ${escape(number(r.angle))}°<br>${escape(number(r.steps))} steps · ${escape(labels[r.view]??r.view)} · ${r.sizeMode==='matched-height'?'Equally tall shapes':'Original preset sizes'}<br>Height ${escape(number(r.obstacleHeight))} cells · Position (${escape(number(r.position?.x))}, ${escape(number(r.position?.y))})</p>
      <details><summary>Model details</summary><p>${escape(r.engine)} · ${escape(number(r.grid?.width))} × ${escape(number(r.grid?.height))} grid · Geometry scale ${escape(number(r.geometryScale))}${r.force?'<br>Force snapshot (relative units, not N): drag '+escape(number(r.force.drag))+' · lift '+escape(number(r.force.lift)):''}</p></details></figure>`).join('')}</div>
    <p class="conditions"><b>Comparison settings:</b> ${differences.length?'Review differences: '+escape(differences.join(', ')):'Other recorded conditions match.'} ${fairReviewed?'Student marked settings reviewed.':'Student has not marked settings reviewed.'} Matching settings does not prove a result.</p>
    <h3>3. My explanation</h3><p class="answer">${answer(conclusion)}</p>
    ${records.every(r=>r.comparison?.repeated)?'<h3>4. My repeat check</h3><p>'+answer(REPEAT_RESPONSES[repeatResult])+'</p>':''}
    <details open><summary>My record checklist</summary><ul>${checks.map(c=>`<li>${c.done?'Recorded':'To add'} · ${escape(c.label)}</li>`).join('')}</ul><p class="settings">These checks show what was recorded. They do not mark your ideas right or wrong.</p></details></section>`;
}

export function makeLearningRecord(record,labels={}){
  if(record.records?.length!==2)throw new Error('Save both views before downloading a learning record.');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>Airflow Lab · My learning record</title><style>
    *{box-sizing:border-box}body{font:16px/1.6 system-ui,sans-serif;color:#163445;background:#f3f6f8;margin:0;padding:24px}main{max-width:1080px;margin:auto}h1{line-height:1.2}h2{font-size:22px}h3{font-size:18px;margin-bottom:6px}p{margin:6px 0 16px}.round{padding:24px;background:white;border:1px solid #cbdcde;border-radius:12px;margin:24px 0}.views{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;min-width:0}img{width:100%;height:auto;display:block;margin:8px 0}.answer{white-space:pre-wrap;overflow-wrap:anywhere}.settings,.missing,footer{font-size:14px;color:#536d78}.conditions{padding:12px;background:#edf8f5;margin:18px 0}details{margin-top:12px}summary{font-weight:600}li{margin:4px 0}.previous>h2{border-top:1px solid #cbdcde;padding-top:24px}@media(max-width:640px){body{padding:12px}.round{padding:16px}.views{grid-template-columns:1fr}}@media print{body{padding:0;background:white;font-size:12pt}.round{padding:12px;border:0}.views{display:block}figure{break-inside:avoid;margin-bottom:18px}img{max-width:640px}.previous{break-before:page}h2,h3,summary{break-after:avoid}}
    </style></head><body><main><h1>Airflow Lab · My learning record</h1><p>Name: ____________________ &nbsp; Class: __________ &nbsp; Date: __________</p><p>My goal: I can compare two flow views and explain using what I see.</p><p class="settings">This file keeps your pictures and full writing. Open it in a browser; use the browser's Print menu to print or save as PDF.</p>
    ${renderRound(record,labels)}${record.previous?.records?.length===2?'<section class="previous"><h2>Previous test · my earlier evidence</h2>'+renderRound(record.previous,labels)+'</section>':''}
    <footer>Simplified 2D learning model · Simulation units · Not a calibrated aerodynamic test. Equally tall shapes have matched frontal height, not equal length or area. Particle trails are visual markers. Compare wake colours, describe uncertainty, and test again when needed.</footer></main></body></html>`;
}
