import {makeTrack,clamp} from './engine.js?v=3';
import {drawFadingTrail} from './trail.js?v=3';
import {GA_DEFAULTS,GENES} from './genetics.js?v=3';
const $=id=>document.getElementById(id);
export function initEvolution({onApply}){
 let worker=null,data=null,selected=null,busy=false,training=false,active=false,timer=null,stopAt=20,replaying=false,replayTime=0,lastFrame=0;
 let config={...GA_DEFAULTS},path=makeTrack(config.track);
 const canvas=$('gaArena'),ctx=canvas.getContext('2d'),chart=$('gaChart'),gx=chart.getContext('2d');
 const settings=['gaTrack','gaPopulation','gaSpeed','gaWeakness','gaMutation','gaSeed','gaLimit'];
 function readConfig(){return {track:$('gaTrack').value,population:Number($('gaPopulation').value),base:Number($('gaSpeed').value),bias:Number($('gaWeakness').value),mutation:Number($('gaMutation').value)/100,seed:Math.round(clamp(Number($('gaSeed').value)||42,1,99999))};}
 function controls(){
  $('gaStart').textContent=training?'Ⅱ Pause evolution':data?'▶ Continue evolution':'▶ Start evolution';
  $('gaStep').disabled=busy||training;$('gaStep').textContent=data?'Next generation →':'Test one generation →';
  $('gaReplay').disabled=!selected||busy;$('gaApply').disabled=!selected||busy;
  $('gaReplay').textContent=replaying?'Ⅱ Pause replay':'▶ Replay selected robot';
  settings.forEach(id=>$(id).disabled=training||busy);
  document.querySelectorAll('.ga-candidate').forEach(b=>b.disabled=busy);
  $('gaStatus').className='status'+(training||busy?' running':'');
  $('gaStatus').replaceChildren();const dot=document.createElement('i');$('gaStatus').append(dot,document.createTextNode(busy?'Testing candidates':training?'Evolving':replaying?'Replaying test':data?'Generation tested':'Ready to evolve'));
 }
 function pause(){training=false;clearTimeout(timer);controls();}
 function reset(){
  pause();if(worker)worker.terminate();worker=null;busy=false;data=null;selected=null;replaying=false;replayTime=0;config=readConfig();path=makeTrack(config.track);
  $('gaSeed').value=config.seed;$('gaSpeedOut').textContent=config.base+'%';$('gaWeaknessOut').textContent=config.bias+'%';$('gaMutationOut').textContent=Math.round(config.mutation*100)+'%';
  $('gaProgress').textContent=`Ready: ${config.population} different starting gene sets.`;render();
 }
 function next(){
  if(busy)return;replaying=false;busy=true;controls();$('gaProgress').textContent='Testing each robot for 12 simulated seconds…';
  if(!worker){
   try{worker=new Worker(new URL('./ga-worker.js?v=3',import.meta.url),{type:'module'});}catch(error){failed(error.message);return;}
   const ownWorker=worker;
   worker.onmessage=event=>{
    if(ownWorker!==worker)return;const message=event.data;
    if(message.type==='progress'){$('gaProgress').textContent=`Testing robot ${message.done} of ${message.total} · 12 simulated seconds each`;return;}
    if(message.type==='error'){failed(message.message);return;}
    if(message.type!=='generation')return;
    busy=false;data=message.result;selected=data.best;replayTime=selected.route.at(-1).t;render();
    $('gaProgress').textContent=`Generation ${data.generation} tested. Best ${data.best.score.toFixed(2)} / 100. Average ${data.mean.toFixed(2)}.`;
    if(training&&data.generation<stopAt)timer=setTimeout(next,600);
    else if(training){pause();$('gaProgress').textContent=`${data.generation} generations complete. Replay a robot, or try its genes in the driving tab.`;}
   };
   worker.onerror=()=>failed('The evolution worker could not load. Refresh this page and try again.');
   worker.postMessage({type:'configure',config});
  }
  worker.postMessage({type:'step'});
 }
 function failed(message){pause();busy=false;if(worker)worker.terminate();worker=null;$('gaProgress').textContent='Evolution stopped: '+message;controls();}
 $('gaStart').addEventListener('click',()=>{
  if(training){pause();$('gaProgress').textContent=busy?'Pausing after this generation finishes.':'Evolution paused. Inspect or replay a robot.';return;}
  training=true;replaying=false;const batch=Number($('gaLimit').value);stopAt=data&&data.generation>=batch?data.generation+batch:batch;controls();if(!busy)next();
 });
 $('gaStep').addEventListener('click',()=>{pause();next();});$('gaReset').addEventListener('click',reset);
 settings.forEach(id=>$(id).addEventListener('change',reset));
 for(const [input,output] of [['gaSpeed','gaSpeedOut'],['gaWeakness','gaWeaknessOut'],['gaMutation','gaMutationOut']])$(input).addEventListener('input',()=>$(output).textContent=$(input).value+'%');
 $('gaReplay').addEventListener('click',()=>{
  if(!selected)return;pause();replaying=!replaying;if(replaying&&replayTime>=selected.route.at(-1).t-.001)replayTime=0;controls();draw();
 });
 $('gaApply').addEventListener('click',()=>{if(!selected)return;pause();replaying=false;onApply({...selected.genome},{...data.config});});
 function render(){
  $('gaGeneration').textContent=data?data.generation:0;$('gaBestScore').textContent=data?data.best.score.toFixed(2):'—';$('gaMeanScore').textContent=data?data.mean.toFixed(2):'—';$('gaPopulationCount').textContent=config.population;
  renderPopulation();renderSelected();controls();draw();drawChart();
 }
 function renderPopulation(){
  const grid=$('gaPopulationGrid');grid.replaceChildren();
  if(!data){const p=document.createElement('p');p.className='ga-empty';p.textContent='Start evolution, or test just one generation. Every first-generation robot begins with random genes.';grid.append(p);return;}
  data.population.forEach((candidate,index)=>{
   const button=document.createElement('button');button.className='ga-candidate'+(candidate===selected?' chosen':'');button.setAttribute('aria-pressed',String(candidate===selected));
   button.setAttribute('aria-label',`${candidate.id}, fitness ${candidate.score.toFixed(2)}, P ${candidate.genome.kp}, I ${candidate.genome.ki}, D ${candidate.genome.kd}`);
   const top=document.createElement('div');top.className='ga-candidate-top';const name=document.createElement('strong');name.textContent=candidate.id;const score=document.createElement('b');score.textContent=candidate.score.toFixed(1);top.append(name,score);
   const dna=document.createElement('div');dna.className='ga-dna';GENES.forEach(g=>{const block=document.createElement('span');block.className=g.label.toLowerCase();block.textContent=g.label+' '+candidate.genome[g.key].toFixed(2);const bar=document.createElement('i');bar.style.width=clamp((candidate.genome[g.key]-g.min)/(g.max-g.min),.03,1)*100+'%';block.append(bar);dna.append(block);});
   const origin=document.createElement('small');origin.className='ga-candidate-origin';origin.textContent=(index===0?'★ Best · ':'')+(candidate.origin==='random'?'Random start':candidate.origin==='elite'?'Elite copy':candidate.mutations.length?`Child · ${candidate.mutations.length} mutated gene${candidate.mutations.length===1?'':'s'}`:'Child · no mutation');
   button.append(top,dna,origin);button.addEventListener('click',()=>{if(busy)return;pause();selected=candidate;replaying=false;replayTime=candidate.route.at(-1).t;render();});grid.append(button);
  });
 }
 function renderSelected(){
  $('gaSelectedName').textContent=selected?selected.id:'Test a generation to begin';$('gaOrigin').textContent=selected?(selected.origin==='elite'?'ELITE · GENES COPIED':selected.origin==='random'?'RANDOM STARTING GENES':'CHILD · PARENT GENES'):'THREE PID GENES';
  for(const g of GENES)$('gaGene'+g.label).textContent=selected?selected.genome[g.key].toFixed(2):'—';
  $('gaSelectedSeen').textContent=selected?selected.seen.toFixed(1)+'%':'—';$('gaFamilyName').textContent=selected?selected.id:'SELECT A ROBOT';
  const body=$('gaFamilyBody');body.replaceChildren();
  if(!selected){$('gaParentA').textContent='PARENT A';$('gaParentB').textContent='PARENT B';$('gaScoreBreakdown').textContent='Each candidate is tested for 12 simulated seconds. A stopped robot misses the remaining readings.';const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.className='empty-results';td.textContent='Test a generation to explore its genes.';tr.append(td);body.append(tr);$('gaFamilyText').textContent='The first generation has random genes. Later generations copy elites or combine parents, with a chance of mutation.';return;}
  const s=selected;$('gaParentA').textContent=s.parents[0]?'PARENT A · '+s.parents[0]:'PARENT A';$('gaParentB').textContent=s.parents[1]?'PARENT B · '+s.parents[1]:'PARENT B';
  $('gaFamilyText').textContent=s.origin==='random'?'This robot started with random genes. It has no parents yet.':s.origin==='elite'?'This robot is one of the two elites. Its genes were copied unchanged from the previous generation.':'Each gene came from one of the two parents. A mutation can then make a small change. Both parent selections can choose the same robot.';
  for(const g of GENES){const mutation=s.mutations.find(m=>m.gene===g.key),values=[g.label,s.parentGenomes?.[0]?.[g.key]?.toFixed(2)??'—',s.parentGenomes?.[1]?.[g.key]?.toFixed(2)??'—',s.origin==='random'?'Random':s.origin==='elite'?s.parents[0]:s.sources[g.key],mutation?`${mutation.before.toFixed(2)} → ${mutation.after.toFixed(2)}`:'No change',s.genome[g.key].toFixed(2)];const tr=document.createElement('tr');values.forEach((text,i)=>{const td=document.createElement('td');td.textContent=text;if(i===4&&mutation)td.className='ga-mutated';tr.append(td);});body.append(tr);}
  $('gaScoreBreakdown').textContent=`${s.parts.progress.toFixed(1)} progress + ${s.parts.line.toFixed(1)} line seen + ${s.parts.centering.toFixed(1)} centred = ${s.score.toFixed(2)} points.`;
 }
 function setup(el,c){const r=el.getBoundingClientRect();if(!r.width||!r.height)return null;const dpr=Math.min(devicePixelRatio||1,2);if(el.width!==Math.round(r.width*dpr)||el.height!==Math.round(r.height*dpr)){el.width=Math.round(r.width*dpr);el.height=Math.round(r.height*dpr);}c.setTransform(dpr,0,0,dpr,0,0);return {w:r.width,h:r.height};}
 function draw(){
  if(!active)return;const size=setup(canvas,ctx);if(!size)return;const {w,h}=size;ctx.clearRect(0,0,w,h);ctx.fillStyle='#fcfcfa';ctx.fillRect(0,0,w,h);ctx.save();const scale=Math.min(w/960,h/580);ctx.translate(w/2,h/2);ctx.scale(scale,scale);ctx.translate(-480,-290);
  ctx.fillStyle='#e2e7e5';for(let x=0;x<960;x+=25)for(let y=0;y<580;y+=25){ctx.beginPath();ctx.arc(x,y,.65,0,Math.PI*2);ctx.fill();}
  ctx.beginPath();path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.lineJoin='round';ctx.strokeStyle='#e8ecea';ctx.lineWidth=42;ctx.stroke();ctx.strokeStyle='#fefefc';ctx.lineWidth=35;ctx.stroke();ctx.strokeStyle='#29333d';ctx.lineWidth=16;ctx.stroke();
  if(selected){
   const route=selected.route;let i=0;while(i+1<route.length&&route[i+1].t<=replayTime)i++;const a=route[i],b=route[Math.min(i+1,route.length-1)],fraction=b.t>a.t?clamp((replayTime-a.t)/(b.t-a.t),0,1):0;
   const pose={x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction,angle:a.angle+(b.angle-a.angle)*fraction,distance:a.distance+(b.distance-a.distance)*fraction};
   const trail=route.slice(0,i+1);trail.push(pose);drawFadingTrail(ctx,{trail,distance:pose.distance,loopLength:selected.loopLength});
   ctx.save();ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);ctx.fillStyle='#293b45';ctx.fillRect(-13,-20,20,7);ctx.fillRect(-13,13,20,7);ctx.fillStyle='#6b9ce8';ctx.beginPath();ctx.roundRect(-19,-15,38,30,9);ctx.fill();ctx.fillStyle='#dfecff';ctx.beginPath();ctx.roundRect(-13,-10,24,20,5);ctx.fill();ctx.strokeStyle='#91acc9';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(22,0);ctx.moveTo(22,-27);ctx.lineTo(22,27);ctx.stroke();for(let j=-2;j<=2;j++){ctx.beginPath();ctx.arc(22,j*12,4,0,Math.PI*2);ctx.fillStyle='#4c77c6';ctx.fill();}ctx.restore();
   $('gaReplayCaption').textContent=`${selected.id} · ${Math.min(replayTime,route.at(-1).t).toFixed(1)} / 12 s recorded test${selected.stopped?' · stopped early':''}${replaying?' · replay at 2×':''}`;
  }else{$('gaReplayCaption').textContent='Every candidate uses the same track, speed, and 12-second test.';}
  ctx.textAlign='center';ctx.fillStyle='#8ca198';ctx.font='600 14px "Segoe UI",sans-serif';ctx.fillText(selected?selected.id+'  /  FITNESS '+selected.score.toFixed(2):config.population+' ROBOTS · 3 GENES EACH',480,285);ctx.font='11px "Segoe UI",sans-serif';ctx.fillStyle='#9aa9a3';ctx.fillText(selected?'P '+selected.genome.kp.toFixed(2)+'   I '+selected.genome.ki.toFixed(2)+'   D '+selected.genome.kd.toFixed(2):'Test a generation to discover their drivers.',480,307);ctx.restore();
 }
 function drawChart(){
  if(!active)return;const size=setup(chart,gx);if(!size)return;const {w,h}=size;gx.clearRect(0,0,w,h);const history=data?.history||[],l=36,r=13,t=22,b=28,iw=w-l-r,ih=h-t-b;
  const values=history.flatMap(p=>[p.best,p.mean]);let low=values.length?Math.max(0,Math.floor(Math.min(...values)/5)*5-5):0,high=values.length?Math.min(100,Math.ceil(Math.max(...values)/5)*5+5):100;if(high-low<10)low=Math.max(0,high-10);
  gx.font='9px "Segoe UI",sans-serif';gx.textAlign='right';gx.textBaseline='middle';for(let j=0;j<5;j++){const y=t+j*ih/4,v=high-j*(high-low)/4;gx.strokeStyle='#edf0f5';gx.beginPath();gx.moveTo(l,y);gx.lineTo(w-r,y);gx.stroke();gx.fillStyle='#98a8b6';gx.fillText(v.toFixed(0),l-8,y);}
  const maxGen=Math.max(5,history.length);gx.textAlign='center';gx.textBaseline='top';for(let j=0;j<5;j++){const gen=1+Math.round(j*(maxGen-1)/4);gx.fillStyle='#9faab6';gx.fillText(String(gen),l+(gen-1)/(maxGen-1)*iw,h-19);}
  for(const [key,color] of [['mean','#dfab75'],['best','#4f7ce1']]){gx.beginPath();history.forEach((p,i)=>{const x=l+(p.generation-1)/(maxGen-1)*iw,y=t+(high-p[key])/(high-low)*ih;i?gx.lineTo(x,y):gx.moveTo(x,y);});gx.strokeStyle=color;gx.lineWidth=2;gx.stroke();history.forEach(p=>{gx.beginPath();gx.arc(l+(p.generation-1)/(maxGen-1)*iw,t+(high-p[key])/(high-low)*ih,2.5,0,Math.PI*2);gx.fillStyle=color;gx.fill();});}
  if(!history.length){gx.fillStyle='#a4b2c0';gx.font='11px "Segoe UI",sans-serif';gx.fillText('Test a generation to plot its fitness',l+iw/2,t+ih*.4);}
  chart.setAttribute('aria-label',data?`Generation ${data.generation}: best fitness ${data.best.score.toFixed(2)}, average ${data.mean.toFixed(2)} out of 100.`:'No generations tested yet.');
 }
 function frame(now){const dt=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;if(active&&replaying&&selected){replayTime=Math.min(replayTime+dt*2,selected.route.at(-1).t);draw();if(replayTime>=selected.route.at(-1).t){replaying=false;controls();}}requestAnimationFrame(frame);}
 window.addEventListener('resize',()=>{draw();drawChart();});document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();replaying=false;controls();}});
 reset();requestAnimationFrame(frame);
 return {setActive(value){active=value;if(!active){pause();replaying=false;}else{draw();drawChart();}controls();},get result(){return data;}};
}
