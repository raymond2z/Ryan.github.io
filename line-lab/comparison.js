import {makeTrack} from './engine.js?v=5';
import {drawFadingTrail} from './trail.js?v=5';
import {TRACK_NAMES,replayPose} from './comparison-core.js?v=5';
const $=id=>document.getElementById(id);
const signed=v=>(v>=0?'+':'')+v.toFixed(2);
export function initComparison({onPause}){
 let first=null,current=null,result=null,worker=null,available=true,active=false,playing=false,time=0,last=0;
 const canvas=$('compareArena'),ctx=canvas.getContext('2d');
 function cancel(){if(worker)worker.terminate();worker=null;playing=false;}
 function clearResult(){cancel();result=null;time=0;render();}
 function ready(){return first&&current?.generation>=2;}
 function controls(){
  const can=Boolean(ready()&&available&&!worker);
  $('compareTraining').disabled=!can;$('compareChallenge').disabled=!can;$('compareTrack').disabled=!can;
  $('comparePlay').disabled=!result||!available||Boolean(worker);$('compareRestart').disabled=$('comparePlay').disabled;
  $('compareScrub').disabled=!result||Boolean(worker);$('comparePlay').textContent=playing?'Ⅱ Pause comparison':'▶ Play comparison';
  $('compareSeekOut').textContent=time.toFixed(1)+' / 12.0 s';$('compareScrub').value=time;
  $('compareGeneration').textContent=current?`Generation 1 → ${current.generation}`:'Complete two generations first';
 }
 function snapshot(){return {generation:current.generation,config:{...current.config},robots:structuredClone([first,current.best])};}
 function startTraining(){
  if(!ready()||!available||worker)return;onPause();cancel();const s=snapshot();
  result={generation:s.generation,trainingTrack:s.config.track,track:s.config.track,base:s.config.base,bias:s.config.bias,robots:s.robots.map(r=>({...r,trainingScore:r.score})),duration:12};
  time=0;playing=true;render();
 }
 function challenge(){
  if(!ready()||!available||worker)return;onPause();cancel();result=null;time=0;
  try{worker=new Worker(new URL('./comparison-worker.js?v=5',import.meta.url),{type:'module'});}catch(error){failed(error.message);return;}
  const ownWorker=worker;worker.onmessage=event=>{if(worker!==ownWorker)return;if(event.data.type==='error'){failed(event.data.message);return;}result=event.data.result;worker.terminate();worker=null;time=0;playing=active;render();};
  worker.onerror=()=>failed('The test could not load. Try the challenge again.');
  worker.postMessage({snapshot:snapshot(),track:$('compareTrack').value});render();
 }
 function failed(message){cancel();result=null;render();$('compareStatus').textContent=message;}
 function render(){
  controls();$('compareResults').hidden=!result;$('comparePlayback').hidden=!result;
  const pending=Boolean(worker),has=Boolean(ready());
  $('compareStatus').textContent=pending?'Testing both locked gene sets for 12 simulated seconds…':result?`${TRACK_NAMES[result.track]} · same start, ${result.base}% speed, ${result.bias}% motor weakness · fixed PID genes · 12-second test`:has?'Choose a training-track replay, or test the same locked genes on a different track.':'Test generation 1, then create and test at least one more generation above.';
  $('comparePrompt').textContent=result&&result.track!==result.trainingTrack?'Think: does the improvement transfer to this track? A new track may be easier or harder; compare both robots within the same test.':'Predict: will the later robot travel farther, stay closer to the line, or make almost the same moves?';
  const body=$('compareRows');body.replaceChildren();
  if(result){
   result.robots.forEach((robot,i)=>{
    const tr=document.createElement('tr');
    const vals=[`${i?'B · Later best':'A · First best'} (${robot.id})`,`P ${robot.genome.kp.toFixed(2)} · I ${robot.genome.ki.toFixed(2)} · D ${robot.genome.kd.toFixed(2)}`,robot.trainingScore.toFixed(2),robot.score.toFixed(2),robot.seen.toFixed(1)+'%',robot.progressLaps.toFixed(2),robot.stopped?'Stopped at '+robot.route.at(-1).t.toFixed(1)+' s':'Finished 12 s'];
    vals.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});body.append(tr);
   });
   const [a,b]=result.robots,change=b.score-a.score,same=Object.keys(a.genome).every(k=>a.genome[k]===b.genome[k]);
   $('compareOutcome').textContent=`Later best − first best: ${signed(change)} fitness points on ${TRACK_NAMES[result.track]}. ${same?'Both have identical genes, so their paths overlap exactly.':Math.abs(change)<.005?'Their scores are almost equal. Look at their paths and line-seen results.':change>0?'The later robot scores higher on this track.':'The later robot scores lower on this track. Training gains did not transfer here.'}`;
   $('compareTrainingLabel').textContent='TRAINING · '+TRACK_NAMES[result.trainingTrack];$('compareTestLabel').textContent='THIS TEST · '+TRACK_NAMES[result.track];
   $('compareFrozen').textContent=`A = best of generation 1 · B = best of generation ${result.generation}. Genes are frozen for this comparison. No collisions; each follows its own recorded test.`;
  }else{$('compareFrozen').textContent='A is the best robot from generation 1, not a deliberately weak robot. B is the best from the latest tested generation.';}
  draw();
 }
 function draw(){
  if(!active)return;const rect=canvas.getBoundingClientRect();if(!rect.width)return;const dpr=Math.min(devicePixelRatio||1,2),w=rect.width,h=rect.height;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#fbfcfa';ctx.fillRect(0,0,w,h);ctx.save();const scale=Math.min(w/960,h/580);ctx.translate(w/2,h/2);ctx.scale(scale,scale);ctx.translate(-480,-290);
  const path=makeTrack(result?.track||current?.config.track||'curves');ctx.beginPath();path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.lineJoin='round';ctx.strokeStyle='#e4e9e7';ctx.lineWidth=40;ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=32;ctx.stroke();ctx.strokeStyle='#29333d';ctx.lineWidth=16;ctx.stroke();
  if(result){
   result.robots.forEach((robot,index)=>{
    const pose=replayPose(robot.route,time),trail=robot.route.slice(0,pose.i+1);trail.push(pose);
    ctx.save();ctx.setLineDash(index?[]:[7,5]);drawFadingTrail(ctx,{trail,distance:pose.distance,loopLength:robot.loopLength},index?'57,111,202':'202,111,42');ctx.restore();
    ctx.save();ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);ctx.fillStyle=index?'#4177ce':'#fff3e7';ctx.strokeStyle=index?'#254f95':'#c56d28';ctx.lineWidth=3;ctx.setLineDash(index?[]:[5,3]);ctx.beginPath();ctx.roundRect(index?-17:-22,index?-13:-18,index?34:44,index?26:36,7);ctx.fill();ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=index?'#fff':'#b35e1d';ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(5,-5);ctx.lineTo(5,5);ctx.closePath();ctx.fill();ctx.restore();
    ctx.font='bold 16px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.fillStyle=index?'#275da9':'#aa561b';ctx.fillText(index?'B':'A',pose.x,pose.y+(index?37:-28));
   });
  }
  ctx.textAlign='center';ctx.fillStyle='#607786';ctx.font='600 16px "Segoe UI",sans-serif';ctx.fillText(result?TRACK_NAMES[result.track]:'FIRST BEST vs LATER BEST',480,280);ctx.font='13px "Segoe UI",sans-serif';ctx.fillText(result?time.toFixed(1)+' / 12.0 seconds':'Compare after two generations',480,305);ctx.restore();
  canvas.setAttribute('aria-label',result?`Synchronized recorded comparison on ${TRACK_NAMES[result.track]}, ${time.toFixed(1)} seconds. A: first-generation best. B: generation ${result.generation} best.`:'Two-robot comparison track. Complete two generations to begin.');
  $('compareSeekOut').textContent=time.toFixed(1)+' / 12.0 s';$('compareScrub').value=time;
 }
 $('compareTraining').addEventListener('click',startTraining);$('compareChallenge').addEventListener('click',challenge);
 $('compareTrack').addEventListener('change',()=>{if(result?.track!==result?.trainingTrack)clearResult();});
 $('comparePlay').addEventListener('click',()=>{if(!result||!available)return;onPause();if(time>=12)time=0;playing=!playing;controls();draw();});
 $('compareRestart').addEventListener('click',()=>{if(!result||!available)return;onPause();time=0;playing=true;controls();draw();});
 $('compareScrub').addEventListener('input',()=>{playing=false;time=Number($('compareScrub').value);controls();draw();});
 function frame(now){const dt=last?Math.min((now-last)/1000,.1):0;last=now;if(active&&playing&&result){time=Math.min(12,time+dt*Number($('compareSpeed').value));draw();if(time>=12){playing=false;controls();}}requestAnimationFrame(frame);}
 window.addEventListener('resize',draw);document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;controls();}});
 requestAnimationFrame(frame);render();
 return {
  update(data){cancel();current=data;if(data.generation===1)first=structuredClone(data.best);const select=$('compareTrack'),old=select.value;select.replaceChildren();Object.entries(TRACK_NAMES).filter(([id])=>id!==data.config.track).forEach(([id,name])=>{const option=document.createElement('option');option.value=id;option.textContent=name;select.append(option);});if(old!==data.config.track&&Object.hasOwn(TRACK_NAMES,old))select.value=old;clearResult();},
  reset(){first=null;current=null;clearResult();},
  setAvailable(value){available=value;if(!value&&worker){cancel();render();}else{if(!value)playing=false;controls();}},
  setActive(value){active=value;if(!value)playing=false;controls();draw();},
  pauseReplay(){playing=false;controls();},
  showTraining(){startTraining();$('gaComparison').scrollIntoView({behavior:'auto',block:'start'});}
 };
}
