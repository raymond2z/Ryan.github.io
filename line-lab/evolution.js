import {initComparison} from './comparison.js?v=5';
import {makeTrack,clamp} from './engine.js?v=5';
import {drawFadingTrail} from './trail.js?v=5';
import {GA_DEFAULTS,GENES} from './genetics.js?v=5';
const $=id=>document.getElementById(id);
export function initEvolution({onApply}){
 let worker=null,data=null,selected=null,busy=false,training=false,active=false,timer=null,stopAt=20,replaying=false,replayTime=0,lastFrame=0;
 let guidePhase='test',planned=null,demonstratedId=null,taughtResult=null;
 let config={...GA_DEFAULTS},path=makeTrack(config.track);
 const canvas=$('gaArena'),ctx=canvas.getContext('2d'),chart=$('gaChart'),gx=chart.getContext('2d');
 const settings=['gaTrack','gaPopulation','gaSpeed','gaWeakness','gaMutation','gaSeed','gaLimit'];
 const comparison=initComparison({onPause(){replaying=false;pause();draw();}});
 function readConfig(){return {track:$('gaTrack').value,population:Number($('gaPopulation').value),base:Number($('gaSpeed').value),bias:Number($('gaWeakness').value),mutation:Number($('gaMutation').value)/100,seed:Math.round(clamp(Number($('gaSeed').value)||42,1,99999))};}
 function controls(){
  comparison.setAvailable(!busy&&!training);
  $('gaStart').textContent=training?'Ⅱ Pause auto-run':'▶ Run automatically';
  $('gaStep').disabled=busy||training;
  $('gaStart').disabled=busy&&!training;
  $('gaReplay').disabled=!selected||busy;$('gaApply').disabled=!selected||busy;
  $('gaReplay').textContent=replaying?'Ⅱ Pause replay':'▶ Replay selected robot';
  settings.forEach(id=>$(id).disabled=training||busy);
  document.querySelectorAll('.ga-candidate').forEach(b=>b.disabled=busy);
  $('gaStatus').className='status'+(training||busy?' running':'');
  renderGuide();
  $('gaStatus').replaceChildren();const dot=document.createElement('i');$('gaStatus').append(dot,document.createTextNode(busy?'Testing candidates':training?'Evolving':replaying?'Replaying test':data?'Generation tested':'Ready to evolve'));
 }
 function pause(){training=false;clearTimeout(timer);controls();}
 function reset(){
  pause();if(worker)worker.terminate();worker=null;busy=false;data=null;selected=null;replaying=false;replayTime=0;guidePhase='test';planned=null;demonstratedId=null;taughtResult=null;config=readConfig();path=makeTrack(config.track);
  comparison.reset();
  $('gaSeed').value=config.seed;$('gaSpeedOut').textContent=config.base+'%';$('gaWeaknessOut').textContent=config.bias+'%';$('gaMutationOut').textContent=Math.round(config.mutation*100)+'%';
  $('gaProgress').textContent=`Ready: ${config.population} different starting gene sets.`;render();
 }
 function next(operation='step'){
  if(busy)return;replaying=false;busy=true;controls();$('gaProgress').textContent=operation==='prepare'?'Selecting parents for the next generation…':'Testing each robot for 12 simulated seconds…';
  if(!worker){
   try{worker=new Worker(new URL('./ga-worker.js?v=5',import.meta.url),{type:'module'});}catch(error){failed(error.message);return;}
   const ownWorker=worker;
   worker.onmessage=event=>{
    if(ownWorker!==worker)return;const message=event.data;
    if(message.type==='progress'){$('gaProgress').textContent=`Testing robot ${message.done} of ${message.total} · 12 simulated seconds each`;return;}
    if(message.type==='error'){failed(message.message);return;}
    if(message.type==='prepared'){busy=false;planned=message.candidates;guidePhase='select';$('gaProgress').textContent='Parents selected. Use the step buttons above to follow one child.';controls();return;}
    if(message.type!=='generation')return;
    const learned=message.result.population.find(p=>p.id===demonstratedId);taughtResult=learned?{child:learned,parents:learned.parents.map(id=>data.population.find(p=>p.id===id))}:null;demonstratedId=null;
    busy=false;data=message.result;comparison.update(data);planned=null;guidePhase='tested';selected=data.best;replayTime=selected.route.at(-1).t;render();
    $('gaProgress').textContent=`Generation ${data.generation} tested. Best ${data.best.score.toFixed(2)} / 100. Average ${data.mean.toFixed(2)}.`;
    if(training&&data.generation<stopAt)timer=setTimeout(next,600);
    else if(training){pause();$('gaProgress').textContent=`${data.generation} generations complete. Replay a robot, or try its genes in the driving tab.`;}
   };
   worker.onerror=()=>failed('The evolution worker could not load. Refresh this page and try again.');
   worker.postMessage({type:'configure',config});
  }
  worker.postMessage({type:operation});
 }
 function failed(message){training=false;clearTimeout(timer);busy=false;if(worker)worker.terminate();worker=null;data=null;selected=null;planned=null;demonstratedId=null;taughtResult=null;guidePhase='test';replaying=false;replayTime=0;comparison.reset();render();$('gaProgress').textContent='Evolution stopped: '+message+' Start a new test to retry.';}
 $('gaStart').addEventListener('click',()=>{
  if(training){pause();$('gaProgress').textContent=busy?'Pausing after this generation finishes.':'Evolution paused. Inspect or replay a robot.';return;}
  if(busy)return;training=true;replaying=false;const batch=Number($('gaLimit').value);stopAt=(data?.generation||0)+batch;controls();if(!busy)next();
 });
 $('gaStep').addEventListener('click',()=>{
  if(busy||training)return;pause();
  if(guidePhase==='tested'){next('prepare');return;}
  if(guidePhase==='select'){guidePhase='mix';controls();return;}
  if(guidePhase==='mix'){guidePhase='mutate';controls();return;}
  next();
 });
 $('gaBack').addEventListener('click',()=>{if(busy||training)return;guidePhase=guidePhase==='mutate'?'mix':'select';controls();});$('gaReset').addEventListener('click',reset);
 settings.filter(id=>id!=='gaLimit').forEach(id=>$(id).addEventListener('change',reset));
 for(const [input,output] of [['gaSpeed','gaSpeedOut'],['gaWeakness','gaWeaknessOut'],['gaMutation','gaMutationOut']])$(input).addEventListener('input',()=>$(output).textContent=$(input).value+'%');
 $('gaReplay').addEventListener('click',()=>{
  if(!selected)return;comparison.pauseReplay();pause();replaying=!replaying;if(replaying&&replayTime>=selected.route.at(-1).t-.001)replayTime=0;controls();draw();
 });
 $('gaApply').addEventListener('click',()=>{if(!selected)return;pause();replaying=false;onApply({...selected.genome},{...data.config});});
 function renderGuide(){
  const generation=data?.generation||0,phase=guidePhase;
  document.querySelectorAll('.ga-stages li').forEach(li=>{const current=li.dataset.stage===(phase==='tested'?'test':phase);li.classList.toggle('current',current);if(current)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
  $('gaGuideGeneration').textContent=phase==='test'?'Generation 1':phase==='tested'?`Generation ${generation} results`:`Generation ${generation} → ${generation+1}`;
  $('gaBack').hidden=!['mix','mutate'].includes(phase);$('gaBack').disabled=busy||training;
  const labels={test:'1. Test generation 1 →',tested:'2. Select parents →',select:'3. Mix parent genes →',mix:'4. Reveal mutations →',mutate:`1. Test generation ${generation+1} →`};
  $('gaStep').textContent=busy?'Working…':labels[phase];
  const visual=$('gaGuideVisual');visual.replaceChildren();
  function card(title,body,kind=''){const el=document.createElement('div');el.className='ga-story-card '+kind;const h=document.createElement('strong'),p=document.createElement('p');h.textContent=title;p.textContent=body;el.append(h,p);visual.append(el);return el;}
  if(phase==='test'){
   $('gaGuideHeading').textContent='Start with a fair test.';
   $('gaGuideText').textContent=`A generation is a group of ${config.population} robots. Each gets different P, I, and D values, then drives for 12 simulated seconds on the same track. Click below to score them.`;
   card('The genes','P reacts now · I corrects lasting error · D responds to change.');
   card('The goal','Travel forward, keep seeing the line, and stay centred. Fitness is a score out of 100.');
   $('gaChange').textContent='Start here. You control when each step happens.';
  }else if(phase==='tested'){
   $('gaGuideHeading').textContent=`Generation ${generation}: what changed?`;
   $('gaGuideText').textContent='The robots are ranked by fitness. Replay any robot below, then select parents to build the next generation.';
   const previous=data.history.at(-2),first=data.history[0];
   card('Best robot',`${data.best.id} · ${data.best.score.toFixed(2)} / 100. Its genes: P ${data.best.genome.kp.toFixed(2)}, I ${data.best.genome.ki.toFixed(2)}, D ${data.best.genome.kd.toFixed(2)}.`);
   if(previous){const gain=data.best.score-previous.best,average=data.mean-previous.mean;card(gain<.005?'Best score held steady':'A better best robot',`Best ${signed(gain)} points; average ${signed(average)} points versus generation ${generation-1}. ${gain<.005?'Two elite copies protect the best result. New children can still be worse.':'The new candidate scored better on this track.'}`);}
   else card('Your starting point',`Average: ${data.mean.toFixed(2)}. This is the baseline for later generations. A strong random start is possible.`);
   if(taughtResult){const {child,parents}=taughtResult,el=card('Our child '+child.id,`${child.score.toFixed(2)} points. Parent A: ${parents[0].score.toFixed(2)}; parent B: ${parents[1].score.toFixed(2)}. ${child.score>Math.max(...parents.map(p=>p.score))?'This child beats both parents.':'This child does not beat both parents. Mixing and mutation do not guarantee improvement.'}`);const button=document.createElement('button');button.textContent='▶ Replay this child';button.addEventListener('click',()=>{pause();selected=child;replayTime=0;replaying=true;render();$('gaArena').scrollIntoView({behavior:'auto',block:'center'});});el.append(button);}
   if(generation>=2){const button=document.createElement('button');button.className='outline compare-shortcut';button.textContent='Compare first vs best ↓';button.disabled=busy||training;button.addEventListener('click',()=>comparison.showTraining());visual.append(button);}
   $('gaChange').textContent=previous?`Since generation 1: best ${signed(data.best.score-first.best)} points · average ${signed(data.mean-first.mean)} points.`:'Next: keep the best two, and choose parents for the other robots.';
  }else if(planned){
   const children=planned.filter(p=>p.origin==='child'),example=children.find(p=>p.mutations.length&&new Set(Object.values(p.sources)).size>1)||children.find(p=>p.mutations.length)||children[0];
   demonstratedId=example.id;
   if(phase==='select'){
    $('gaGuideHeading').textContent='Keep two elites. Choose the parents.';
    $('gaGuideText').textContent=`The two highest-scoring robots are copied unchanged. To fill the other ${children.length} places, each parent is chosen by picking 3 robots at random and taking the best of those 3. A parent can be chosen more than once.`;
    const counts=new Map();children.forEach(p=>p.parents.forEach(id=>counts.set(id,(counts.get(id)||0)+1)));
    data.population.filter((p,i)=>i<2||counts.has(p.id)).forEach((p,i)=>{const elite=data.population.indexOf(p)<2;card(p.id+` · ${p.score.toFixed(2)} points`,`${elite?'Elite: copied unchanged. ':''}Chosen as a parent ${counts.get(p.id)||0} time(s).`,elite?'elite':'');});
    $('gaChange').textContent=`These are the actual parents for generation ${generation+1}. No new scores yet.`;
   }else{
    const mutationPhase=phase==='mutate';
    $('gaGuideHeading').textContent=mutationPhase?'A small change creates a new possibility.':'Build one child from two parents.';
    $('gaGuideText').textContent=mutationPhase?`Actual child ${example.id}: each gene has a ${Math.round(config.mutation*100)}% chance of a small random change. A changed gene is not automatically better. The next test will tell us.`:`Actual child ${example.id}: parent A is ${example.parents[0]}; parent B is ${example.parents[1]}. Each gene is independently copied from one parent. Both choices can select the same parent.`;
    GENES.forEach(g=>{const mutation=example.mutations.find(m=>m.gene===g.key),source=example.sources[g.key],before=mutation?mutation.before:example.genome[g.key],a=example.parentGenomes[0][g.key],b=example.parentGenomes[1][g.key];
     const el=card(g.label+' gene',mutationPhase?(mutation?'Mutated · test it to find out if it helps.':'No mutation · inherited value kept.'):`Copied from ${source}.`,mutationPhase&&mutation?'mutated':g.label.toLowerCase());
     const flow=document.createElement('div');flow.className='ga-gene-flow';
     if(mutationPhase){flow.textContent=`${before.toFixed(2)} → ${example.genome[g.key].toFixed(2)}`;}
     else{for(const [index,value] of [a,b].entries()){const chip=document.createElement('span');chip.textContent=`${index===0?'A':'B'}: ${value.toFixed(2)}`;if(example.parents[index]===source)chip.className='inherited';flow.append(chip);}const result=document.createElement('b');result.textContent='→ '+before.toFixed(2);flow.append(result);}
     el.insertBefore(flow,el.lastChild);
    });
    const changes=children.reduce((n,p)=>n+p.mutations.length,0);
    $('gaChange').textContent=mutationPhase?`Whole generation: 2 unchanged elites + ${children.length} children · ${changes} changed genes. Ready to test.`:'This shows one real child. The same process fills the other places in the next generation.';
   }
  }
 }
 function signed(value){return (value>=0?'+':'')+value.toFixed(2);}

 function render(){
  $('gaGeneration').textContent=data?data.generation:0;$('gaBestScore').textContent=data?data.best.score.toFixed(2):'—';$('gaMeanScore').textContent=data?data.mean.toFixed(2):'—';$('gaPopulationCount').textContent=config.population;
  renderPopulation();renderSelected();controls();draw();drawChart();
 }
 function renderPopulation(){
  const grid=$('gaPopulationGrid');grid.replaceChildren();
  if(!data){const p=document.createElement('p');p.className='ga-empty';p.textContent='Use “Test generation 1” above. Each robot begins with different random PID settings.';grid.append(p);return;}
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
  const low=0,high=100;
  gx.font='9px "Segoe UI",sans-serif';gx.textAlign='right';gx.textBaseline='middle';for(let j=0;j<5;j++){const y=t+j*ih/4,v=high-j*(high-low)/4;gx.strokeStyle='#edf0f5';gx.beginPath();gx.moveTo(l,y);gx.lineTo(w-r,y);gx.stroke();gx.fillStyle='#98a8b6';gx.fillText(v.toFixed(0),l-8,y);}
  const maxGen=Math.max(5,history.length);gx.textAlign='center';gx.textBaseline='top';for(let j=0;j<5;j++){const gen=1+Math.round(j*(maxGen-1)/4);gx.fillStyle='#9faab6';gx.fillText(String(gen),l+(gen-1)/(maxGen-1)*iw,h-19);}
  for(const [key,color] of [['mean','#dfab75'],['best','#4f7ce1']]){gx.beginPath();history.forEach((p,i)=>{const x=l+(p.generation-1)/(maxGen-1)*iw,y=t+(high-p[key])/(high-low)*ih;i?gx.lineTo(x,y):gx.moveTo(x,y);});gx.strokeStyle=color;gx.lineWidth=2;gx.stroke();history.forEach(p=>{gx.beginPath();gx.arc(l+(p.generation-1)/(maxGen-1)*iw,t+(high-p[key])/(high-low)*ih,2.5,0,Math.PI*2);gx.fillStyle=color;gx.fill();});}
  if(!history.length){gx.fillStyle='#a4b2c0';gx.font='11px "Segoe UI",sans-serif';gx.fillText('Test a generation to plot its fitness',l+iw/2,t+ih*.4);}
  chart.setAttribute('aria-label',data?`Generation ${data.generation}: best fitness ${data.best.score.toFixed(2)}, average ${data.mean.toFixed(2)} out of 100.`:'No generations tested yet.');
 }
 function frame(now){const dt=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;if(active&&replaying&&selected){replayTime=Math.min(replayTime+dt*2,selected.route.at(-1).t);draw();if(replayTime>=selected.route.at(-1).t){replaying=false;controls();}}requestAnimationFrame(frame);}
 window.addEventListener('resize',()=>{draw();drawChart();});document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();replaying=false;controls();}});
 reset();requestAnimationFrame(frame);
 return {setActive(value){active=value;comparison.setActive(value);if(!active){pause();replaying=false;}else{draw();drawChart();}controls();},get result(){return data;}};
}
