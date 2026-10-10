import {FluidSimulation} from './simulation.mjs';
import {EXTRA_SHAPES,shapePreview} from './shapes.mjs';
import {makeAdaptiveStepper,STEP_FIXED,MAX_TRACER_DEBT,createGpuPaintPacer,forceFrameTiming} from './live-performance.mjs?build=fps-pacing-20261010';
import {createStabilityRecorder,STABILITY_BUILD} from './stability-recorder.mjs';
import {createMatchedComparison,comparisonDifferences,setComparisonShape,seededRandom} from './shape-comparison.mjs?build=stage4b-20261010';
const $=id=>document.getElementById(id);
const stability=createStabilityRecorder();
let stabilityTimer=null,stabilityFinishedShown=false;
const researchPage=location.pathname.endsWith('/stability.html');
function stabilityConfig(){
  return {build:STABILITY_BUILD,sourceBaseline:'e644e248b6ff24b4b73dd50b7fbfa9dd4fadd596',
    deviceLabel:$('stabilityDevice')?.value.trim()||'Unspecified',engine:engineKind,
    grid:{width:W,height:H,quality:qualityOption},shape:sim.shape,angle:sim.angle,
    position:{x:sim.centerX,y:sim.centerY},speed:sim.speed,viscosity:sim.viscosity,
    animation:$('animation').value,batchMode:$('batchMode').value,
    forceEnabled:$('force').checked,particles:$('particles').checked,
    vectors:$('vectors').checked,view,interfaceBuild:'stage4b-20261010',
    sizeMode:shapeAppearance?.sizeMode??'preset',geometryScale:shapeAppearance?.scale??sim.shapeScale};
}
function stabilityActivity(){
  return {running,hidden:document.hidden,interacting:Boolean(pointer)};
}
function stabilityEvent(kind,details={}){stability.event(kind,details,performance.now());}
function refreshStability(){
  if(!$('stabilityStatus'))return;
  const now=performance.now();stability.observeState(stabilityConfig(),stabilityActivity(),now);
  stability.tick(now,new Date().toISOString());
  const progress=stability.progress(now);
  $('startStability').disabled=stability.active||comparison.active;
  $('stopStability').disabled=!stability.active;
  $('exportStability').disabled=!stability.hasReport;
  $('stabilityDuration').disabled=stability.active;$('stabilityDevice').disabled=stability.active;
  // Engine/detail switches reload the document and would discard the active run.
  $('engine').disabled=stability.active||comparison.active;$('quality').disabled=stability.active||comparison.active;
  if(!progress)return;
  if(stability.active){
    const remaining=Math.max(0,Math.ceil((progress.requestedDurationMs-progress.elapsedMs)/1000));
    $('stabilityStatus').textContent=`Recording · ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} remaining · ${progress.paints} paints · ${progress.events} events`;
  }else if(!stabilityFinishedShown){
    stabilityFinishedShown=true;
    const report=stability.report(now),summary=report.summary;
    $('stabilityStatus').textContent=`${progress.status==='completed'?'Timer completed':'Recording stopped'} · Paint interval P95 ${ms(summary.paintIntervalMs.p95)} · Worker round-trip P95 ${ms(summary.workerRoundTripMs.p95)} · ${report.assessment.needsReview?'Events need review':'Review the JSON before judging stability'}`;
    clearInterval(stabilityTimer);stabilityTimer=null;
  }
}
function exportStability(){
  refreshStability();const record=stability.report(performance.now());if(!record)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='airflow-stage3-4a-stability.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}

// Mobile-first performance selection. The user can explicitly choose a detailed grid.
const qualityPreference=new URLSearchParams(location.search).get('quality');
const qualityOption=['fast','detail'].includes(qualityPreference)?qualityPreference:'auto';
const useFastGrid=qualityOption==='fast'||(qualityOption==='auto'&&(matchMedia('(pointer: coarse)').matches||innerWidth<700));
const sim=new FluidSimulation(useFastGrid?168:240,useFastGrid?72:104);
const enginePreference=new URLSearchParams(location.search).get('engine');
const engineChoice=['javascript','wasm','webgpu'].includes(enginePreference)?enginePreference:'auto';
let engineKind='javascript';
let wasmActive=false,wasmStarting=false,wasmWorker=null,workerRequest=0,workerInFlight=0;
let engineRevision=0,lastWorkerRequest=0,manualSteps=0,gpuForceValid=false;
const stepper=makeAdaptiveStepper({targetMs:30});
const gpuPaintPacer=createGpuPaintPacer();
const tuningPreference=new URLSearchParams(location.search).get('tune');
let gpuFluidDirty=false,gpuParticleDebt=0,windowGpuSnapshots=0,lastSnapshotHz=0,lastCanvasFps=0,lastFlowRate=0;
const gpuSamples=[],paintSamples=[],maxSamples=160;
const recentMean=(list,key,n=30)=>{const values=list.slice(-n).map(s=>s[key]).filter(Number.isFinite);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;};
const ms=value=>Number.isFinite(value)?value.toFixed(1)+' ms':'—';
const bounded=(items,item)=>{items.push(item);if(items.length>maxSamples)items.shift();};
function refreshPerformance(){
  const gpu=wasmActive&&engineKind==='webgpu',avg=key=>gpu?recentMean(gpuSamples,key):null;
  $('perfPaint').textContent=ms(recentMean(paintSamples,'paintMs'));
  $('perfEncode').textContent=ms(avg('encodeMs'));
  $('perfWait').textContent=ms(avg('queueReadbackMs'));
  $('perfUnpack').textContent=ms(avg('unpackMs'));
  $('perfRoundTrip').textContent=ms(avg('roundTripMs'));
  $('perfSnapshots').textContent=gpu?lastSnapshotHz.toFixed(0)+' /s':'—';
  $('perfBatch').textContent=gpu?($('batchMode').value==='adaptive'?stepper.batch:STEP_FIXED)+' steps':'—';
  $('perfStatus').textContent=gpu
    ?Math.round(lastCanvasFps)+' paints/s vs '+Math.round(lastSnapshotHz)+' new fields/s'
    :'GPU timing shown only while WebGPU runs';
}
function resetPerformance(){
  gpuSamples.length=0;paintSamples.length=0;stepper.reset();
  windowGpuSnapshots=0;performanceWindow=performance.now();paintedFrames=0;simulatedSteps=0;
  refreshPerformance();
}
function exportPerformance(){
  const record={benchmark:'Airflow Stage 3.3 live diagnostic · wall-clock, not GPU hardware timestamp',
    collectedAt:new Date().toISOString(),engine:engineKind,
    grid:{width:W,height:H,quality:qualityOption},shape:sim.shape,
    speed:sim.speed,viscosity:sim.viscosity,animation:$('animation').value,
    forceEnabled:$('force').checked,batchMode:$('batchMode').value,
    adaptiveBatch:stepper.batch,liveCanvasFps:lastCanvasFps,
    liveGpuSnapshotsHz:lastSnapshotHz,liveFlowStepsPerSecond:lastFlowRate,
    performanceSamples:gpuSamples,paintSamples,
    note:'Queue/readback wait includes GPU execution and synchronization; independent fluid frames/s are not Canvas FPS.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='airflow-stage3-3-live-performance.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
let performanceWindow=performance.now(),paintedFrames=0,simulatedSteps=0;
const requestedWasm=engineChoice!=='javascript';
const canvas=$('tunnel'),ctx=canvas.getContext('2d',{alpha:false});
const field=document.createElement('canvas');field.width=sim.width;field.height=sim.height;
const fieldCtx=field.getContext('2d',{alpha:false});
const pixels=fieldCtx.createImageData(sim.width,sim.height);
const W=sim.width,H=sim.height,SX=canvas.width/W,SY=canvas.height/H;
const names={circle:'Circle',block:'Block',streamlined:'Streamlined',plate:'Flat plate',custom:'Custom drawing',none:'No shape',...Object.fromEntries(Object.entries(EXTRA_SHAPES).map(([key,value])=>[key,value.label]))};
const presetNames=['circle','block','streamlined','plate',...Object.keys(EXTRA_SHAPES),'none'];
const animationModes={slow:3,normal:7,fast:12,super_fast:24};
const viewNames={curl:'Swirls',speed:'Speed',density:'Density'};
const notes={circle:'Look for alternating swirls behind the circle. This disturbed region is called the <b>wake</b>.',block:'Watch the sharp corners. Does the flow reconnect smoothly behind the block, or leave a wide wake?',streamlined:'Follow the flow along the curved front and tapered tail. Compare its wake with the block at the same settings.',plate:'A thin plate can still interrupt the flow. What changes when you turn it at an angle?',custom:'Try one simple shape at a time. Keep a gap around it so the fluid has room to pass.',none:'With no obstacle, the flow should become nearly uniform. Add a shape to see how the flow changes.'};
for(const [key,value]of Object.entries(EXTRA_SHAPES))notes[key]=value.note;
document.querySelectorAll('[data-shape-preview]').forEach(el=>el.innerHTML=shapePreview(el.dataset.shapePreview));
let view='curl',tool='move',running=!matchMedia('(prefers-reduced-motion: reduce)').matches;
let sensor=null,pointer=null,particles=[],captures=[],experiment='shapes',lastFrame=0,lastReadout=0,pendingSteps=0,toastTimer;
const comparison=createMatchedComparison();
let comparisonLocks=[],particleRandom=Math.random,comparisonPrediction='';
let shapeAppearance=null,previousComparison=null,comparisonRound=1;
const comparisonLockSelector='[data-shape],[data-view],[data-level],[data-tool],[data-experiment],#setupExperiment,#demoButton,#nextDemo,#speed,#angle,#animation,#viscosity,#quality,#engine,#batchMode,#force,#particles,#vectors,#clearButton,#resetButton,#stepButton,#captureButton,#startStability,#prediction,#comparisonShapeA,#comparisonShapeB,#matchShapeHeight';
function chosenComparisonPair(){return [$('comparisonShapeA')?.value||'block',$('comparisonShapeB')?.value||'streamlined'];}
function syncComparisonChoices(){
  const pair=comparison.active?comparison.plan.pair:chosenComparisonPair();
  if($('comparisonTitle'))$('comparisonTitle').textContent=`Compare ${names[pair[0]]} and ${names[pair[1]]}`;
  if($('startComparison'))$('startComparison').textContent=`Observe A · ${names[pair[0]]}`;
  if($('nextComparison'))$('nextComparison').textContent=`Observe B · ${names[pair[1]]}`;
  if(experiment==='shapes'){
    $('prediction').options[1].textContent=`${names[pair[0]]} has the narrower wake`;
    $('prediction').options[2].textContent=`${names[pair[1]]} has the narrower wake`;
  }
}
function lockComparison(){
  comparisonLocks=[...document.querySelectorAll(comparisonLockSelector)].map(el=>({el,disabled:el.disabled}));
  comparisonLocks.forEach(({el})=>el.disabled=true);
  canvas.setAttribute('aria-disabled','true');
}
function unlockComparison(){
  comparisonLocks.forEach(({el,disabled})=>el.disabled=disabled);comparisonLocks=[];
  canvas.removeAttribute('aria-disabled');particleRandom=Math.random;
  $('angle').disabled=['custom','none'].includes(sim.shape);
  if(stability.active){$('engine').disabled=true;$('quality').disabled=true;}
  renderCaptures();refreshComparison();
}
function refreshComparison(){
  if(!$('comparisonStatus'))return;
  const pair=chosenComparisonPair();
  $('startComparison').disabled=comparison.active||wasmStarting||stability.active||captures.length>0||Boolean(pointer)||pair[0]===pair[1];
  $('nextComparison').hidden=comparison.phase!=='ready-b';
  $('cancelComparison').hidden=!comparison.active;
  $('playButton').disabled=comparison.phase==='ready-b';
  if($('repeatComparison'))$('repeatComparison').hidden=comparison.active||captures.length!==2||!captures.every(r=>r.comparison?.matched&&r.comparison.round===comparisonRound);
  if($('repeatReflection'))$('repeatReflection').hidden=!previousComparison||captures.length!==2||!captures.every(r=>r.comparison?.repeated);
  if(comparison.running){
    const letter=comparison.phase==='running-a'?'A':'B';
    $('comparisonStatus').textContent=`${running?'Observing':'Paused'} ${letter} · ${names[comparison.shape]} · ${Math.min(sim.time,2000).toLocaleString()} / 2,000 steps. Settings stay the same; you can pause or exit.`;
  }else if(comparison.phase==='ready-b'){
    $('comparisonStatus').textContent='A saved. Describe the wake below, then observe B with the same wind, position and elapsed steps.';
  }else if(comparison.phase==='done'&&captures.length===2&&captures.every(r=>r.comparison?.matched)){
    $('comparisonStatus').textContent=`Round ${comparisonRound}: A and B saved at 2,000 steps. Compare the wake colours. Repeat the same test to check your observation; the latest completed pair will be kept below.`;
  }else if(captures.length){
    $('comparisonStatus').textContent='Remove the saved views before starting a new matched comparison.';
  }else if(wasmStarting){
    $('comparisonStatus').textContent='Preparing the flow. Your comparison will be ready shortly.';
  }else if(pair[0]===pair[1]){
    $('comparisonStatus').textContent='Choose two different shapes, then make a prediction.';
  }else if(!comparison.active){
    $('comparisonStatus').textContent='Choose two shapes and predict first. We will keep the same wind, position and elapsed steps. “Equally tall” controls front-facing height, not length or area.';
  }
}
function prepareComparisonTrial(){
  const plan=comparison.plan;
  sim.speed=plan.speed;sim.viscosity=plan.viscosity;
  manualSteps=0;pendingSteps=0;sensor=null;$('sensorReadout').hidden=true;
  particleRandom=seededRandom();
  shapeAppearance=setComparisonShape(sim,plan,comparison.shape);
  press('shape',comparison.shape);$('angle').value='0';$('angleValue').textContent='0°';
  $('observation').innerHTML=notes[comparison.shape];
  $('canvasNote').textContent=`${plan.matchHeight?'Equally tall · ':''}Watch the wake behind the ${names[comparison.shape].toLowerCase()}`;
  resetParticles();resetRustField();running=true;syncRunning();paint();refreshComparison();
}
function startComparison(){
  if(comparison.active||stability.active||wasmStarting||captures.length||pointer)return;
  if(!$('prediction').value){notify('Choose a prediction first. “I’m not sure yet” is a prediction too.');$('prediction').focus();return;}
  try{comparison.start({speed:sim.speed,viscosity:sim.viscosity,position:{x:sim.centerX,y:sim.centerY},
    grid:{width:W,height:H},engine:engineKind,view:'speed',animation:$('animation').value,
    batchMode:$('batchMode').value,shapeScale:sim.shapeScale,pair:chosenComparisonPair(),matchHeight:$('matchShapeHeight')?.checked!==false,predictionValue:$('prediction').value});
  }catch(error){notify(error.message);return;}
  comparisonRound=1;comparisonPrediction=$('prediction').options[$('prediction').selectedIndex].textContent;
  beginComparisonRun();
}
function beginComparisonRun(){
  const plan=comparison.plan;
  sim.speed=plan.speed;sim.viscosity=plan.viscosity;
  $('speed').value=plan.speed;$('speedValue').textContent=plan.speed.toFixed(3);
  $('viscosity').value=plan.viscosity;$('viscosityValue').textContent=plan.viscosity.toFixed(3);
  $('animation').value=plan.animation;$('batchMode').value=plan.batchMode;
  $('force').checked=false;gpuForceValid=false;syncGpuForce();showForceReadout();
  $('particles').checked=true;$('vectors').checked=false;setView('speed');toolSelected('move');
  lockComparison();prepareComparisonTrial();
  $('canvasWrap').scrollIntoView({behavior:'smooth',block:'center'});
}
function repeatComparison(){
  if(comparison.active||wasmStarting||stability.active||pointer||captures.length!==2||!captures.every(r=>r.comparison?.matched))return;
  const plan=comparison.plan;
  if(!plan||plan.engine!==engineKind){notify('The engine changed. Keep this report, then start a fresh pair using the current engine.');return;}
  try{comparison.start(plan);}catch(error){notify(error.message);return;}
  // Keep one complete previous pair, including its notes and reflection.
  previousComparison={captures:captures.map(r=>structuredClone(r)),conclusion:$('conclusion').value,
    prediction:comparisonPrediction,repeatResult:$('repeatResult')?.value||'',round:comparisonRound};
  comparisonRound++;captures=[];
  $('comparisonShapeA').value=plan.pair[0];$('comparisonShapeB').value=plan.pair[1];
  $('matchShapeHeight').checked=plan.matchHeight;$('prediction').value=plan.predictionValue;
  experiment='shapes';press('experiment','shapes');$('guidedComparison').hidden=false;
  $('conclusion').value='';$('repeatResult').value='';
  syncComparisonChoices();renderPreviousComparison();renderCaptures();beginComparisonRun();
}
function renderPreviousComparison(){
  const root=$('previousComparison');if(!root)return;
  root.replaceChildren();root.hidden=!previousComparison;if(!previousComparison)return;
  const title=document.createElement('summary');title.textContent=`Previous test · Round ${previousComparison.round} · pictures and notes`;root.append(title);
  const info=document.createElement('p');info.textContent=`Prediction: ${previousComparison.prediction}. Explanation: ${previousComparison.conclusion||'Not recorded'}`;root.append(info);
  const grid=document.createElement('div');grid.className='captures previous-captures';
  previousComparison.captures.forEach((record,index)=>{
    const figure=document.createElement('figure');figure.className='capture-card';
    const img=document.createElement('img');img.src=record.image;img.alt=`Previous view ${index?'B':'A'} · ${names[record.shape]}`;
    const caption=document.createElement('figcaption');caption.className='capture-caption';
    const heading=document.createElement('strong');heading.textContent=`${index?'B':'A'} · ${names[record.shape]}`;
    const settings=document.createElement('div');settings.textContent=`Wind ${record.speed.toFixed(3)} · ${record.steps.toLocaleString()} steps · Height ${record.obstacleHeight} cells`;
    const note=document.createElement('p');note.textContent=record.note||'No observation recorded.';
    caption.append(heading,settings,note);figure.append(img,caption);grid.append(figure);
  });root.append(grid);
  const download=document.createElement('button');download.className='secondary-button';download.textContent='Download previous report';
  download.addEventListener('click',()=>exportReport(previousComparison.captures,previousComparison).catch(()=>notify('Could not export the previous report.')));root.append(download);
}
function cancelComparison(message='Comparison ended. Your saved views remain below; remove them to start again.'){
  if(!comparison.active)return;
  comparison.cancel();running=false;manualSteps=0;pendingSteps=0;syncRunning();unlockComparison();
  if($('comparisonStatus'))$('comparisonStatus').textContent=message;
  notify(message);
}
function finishComparisonTrial(){
  if(!comparison.running||sim.time<comparison.plan.targetSteps)return;
  const letter=comparison.phase==='running-a'?'A':'B';
  try{
    comparison.complete(sim.time);running=false;pendingSteps=0;manualSteps=0;
    if(gpuParticleDebt>0){moveParticles(gpuParticleDebt);gpuParticleDebt=0;}
    syncRunning();capture({matched:true,letter,prediction:comparisonPrediction,round:comparisonRound,repeated:comparisonRound>1});
    if(comparison.phase==='done')unlockComparison();else refreshComparison();
  }catch(error){
    comparison.cancel();running=false;pendingSteps=0;manualSteps=0;syncRunning();unlockComparison();
    $('comparisonStatus').textContent=error.message;notify(error.message);
  }
}
const particleCount=useFastGrid?190:460;
const maxTrailPoints=useFastGrid?16:22;
const paintInterval=useFastGrid?1000/30:0;
let lastPaint=0;

function makeParticle(startAnywhere=true) {
  let x=2,y=2;
  for(let attempt=0;attempt<20;attempt++) {
    x=startAnywhere?2+particleRandom()*(W-4):2; y=4+particleRandom()*(H-8);
    if(!sim.solid[Math.floor(x)+Math.floor(y)*W]) break;
  }
  return {x,y,trail:[]};
}
function resetParticles(){particles=Array.from({length:particleCount},()=>makeParticle());}
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function paint() {
  const paintStarted=performance.now();
  paintedFrames++;
  const data=pixels.data;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) {
    const i=x+y*W,k=i*4;
    let r=11,g=24,b=38;
    if(sim.solid[i]) {r=sim.shape==='pikachu'?250:224;g=sim.shape==='pikachu'?209:235;b=sim.shape==='pikachu'?64:240;}
    else {
      let value=0,target;
      if(view==='curl') {
        value=(x>0&&x<W-1&&y>0&&y<H-1)?sim.curlAt(i)/.025:0;
        target=value>=0?[251,168,75]:[68,210,226];
        value=Math.min(1,Math.abs(value));
        value=Math.pow(value,.65);
      } else if(view==='speed') {
        value=Math.min(1,Math.hypot(sim.ux[i],sim.uy[i])/.4);
        if(value<.5){target=[26,135,169];value*=2;}
        else {r=26;g=135;b=169;target=[247,208,103];value=(value-.5)*2;}
      } else {
        value=(sim.rho[i]-1)/.20;target=value>=0?[245,168,86]:[71,207,222];value=Math.min(1,Math.abs(value));
      }
      r+=value*(target[0]-r);g+=value*(target[1]-g);b+=value*(target[2]-b);
    }
    data[k]=r;data[k+1]=g;data[k+2]=b;data[k+3]=255;
  }
  fieldCtx.putImageData(pixels,0,0);
  ctx.imageSmoothingEnabled=true;ctx.drawImage(field,0,0,canvas.width,canvas.height);
  // A subtle coordinate grid keeps the flow legible without concealing it.
  ctx.strokeStyle='rgba(140,175,194,.045)';ctx.lineWidth=1;ctx.beginPath();
  for(let x=0;x<W;x+=20){ctx.moveTo(x*SX,0);ctx.lineTo(x*SX,canvas.height);}
  for(let y=0;y<H;y+=20){ctx.moveTo(0,y*SY);ctx.lineTo(canvas.width,y*SY);}ctx.stroke();
  if($('particles').checked) {
    ctx.strokeStyle='rgba(236,255,255,.26)';ctx.lineWidth=1.1;ctx.beginPath();
    for(const p of particles) {
      if(p.trail.length){ctx.moveTo(p.trail[0][0]*SX,p.trail[0][1]*SY);for(const pos of p.trail)ctx.lineTo(pos[0]*SX,pos[1]*SY);ctx.lineTo(p.x*SX,p.y*SY);}
    }ctx.stroke();ctx.fillStyle='rgba(230,253,255,.82)';
    ctx.beginPath();for(const p of particles){ctx.moveTo(p.x*SX+1.6,p.y*SY);ctx.arc(p.x*SX,p.y*SY,1.6,0,Math.PI*2);}ctx.fill();
  }
  if($('vectors').checked) {
    ctx.strokeStyle='rgba(224,248,252,.6)';ctx.lineWidth=1.4;
    for(let y=10;y<H-6;y+=10)for(let x=10;x<W-6;x+=12){const i=x+y*W;if(sim.solid[i])continue;arrow(x*SX,y*SY,sim.ux[i]*SX*45,sim.uy[i]*SY*45);}
  }
  if($('force').checked) {
    let x=0,y=0,count=0;for(let i=0;i<sim.n;i++)if(sim.solid[i]){x+=i%W;y+=Math.floor(i/W);count++;}
    if(count) {
      ctx.strokeStyle='#b4f89d';ctx.lineWidth=3;
      const length=Math.min(120,Math.hypot(sim.forceX,sim.forceY)*160);
      const direction=Math.atan2(sim.forceY,sim.forceX);
      arrow(x/count*SX,y/count*SY,length*Math.cos(direction),length*Math.sin(direction));
      ctx.fillStyle='#b4f89d';ctx.font='16px system-ui';ctx.fillText('Model force',x/count*SX+12,y/count*SY-20);
    }
  }
  if(sensor) {
    ctx.strokeStyle='#fff';ctx.lineWidth=2;const x=sensor.x*SX,y=sensor.y*SY;
    ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.moveTo(x-14,y);ctx.lineTo(x-5,y);ctx.moveTo(x+5,y);ctx.lineTo(x+14,y);ctx.moveTo(x,y-14);ctx.lineTo(x,y-5);ctx.moveTo(x,y+5);ctx.lineTo(x,y+14);ctx.stroke();
  }
  const paintMs=forceFrameTiming(performance.now()-paintStarted);
  bounded(paintSamples,{paintMs});stability.paint(paintMs,performance.now());
}
function arrow(x,y,dx,dy) {
  if(Math.hypot(dx,dy)<1)return;
  const a=Math.atan2(dy,dx),head=Math.min(6,Math.hypot(dx,dy)*.4),ex=x+dx,ey=y+dy;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.moveTo(ex-head*Math.cos(a-.5),ey-head*Math.sin(a-.5));ctx.lineTo(ex,ey);ctx.lineTo(ex-head*Math.cos(a+.5),ey-head*Math.sin(a+.5));ctx.stroke();
}
function moveParticles(steps) {
  // Short midpoint steps follow curved paths and avoid jumping through thin barriers.
  const substeps=Math.max(1,Math.ceil(steps/2)),dt=steps/substeps;
  const velocityAt=(x,y)=>{
    const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy,i=ix+iy*W;
    const interpolate=arr=>arr[i]*(1-tx)*(1-ty)+arr[i+1]*tx*(1-ty)+arr[i+W]*(1-tx)*ty+arr[i+W+1]*tx*ty;
    return [interpolate(sim.ux),interpolate(sim.uy)];
  };
  const valid=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=1&&x<W-2&&y>=2&&y<H-2&&!sim.solid[Math.floor(x)+Math.floor(y)*W];
  for(let j=0;j<particles.length;j++) {
    const p=particles[j];p.trail.push([p.x,p.y]);if(p.trail.length>maxTrailPoints)p.trail.shift();
    for(let k=0;k<substeps;k++){
      if(!valid(p.x,p.y)){particles[j]=makeParticle(false);break;}
      const [u,v]=velocityAt(p.x,p.y),mx=p.x+u*dt*.5,my=p.y+v*dt*.5;
      if(!valid(mx,my)){particles[j]=makeParticle(false);break;}
      const [mu,mv]=velocityAt(mx,my);p.x+=mu*dt;p.y+=mv*dt;
      if(!valid(p.x,p.y)){particles[j]=makeParticle(false);break;}
    }
  }
}
function updateProbe() {
  if(!sensor)return;
  const s=sim.sample(sensor.x,sensor.y);$('sensorReadout').hidden=false;
  $('sensorText').textContent=s.solid?'Inside a barrier — choose a fluid point.':`Speed ${s.speed.toFixed(3)} · Density ${s.density.toFixed(3)} · Step ${sim.time.toLocaleString()}`;
}
function runSteps(count,budgetMs=Infinity) {
  count=comparison.limit(count,sim.time);
  const start=performance.now();let completed=0;
  try{
    while(completed<count){sim.step();completed++;if(performance.now()-start>=budgetMs)break;}
    moveParticles(completed);simulatedSteps+=completed;return completed;
  }
  catch{cancelComparison('The flow changed unexpectedly. Start a fresh comparison with gentler wind.');stabilityEvent('engine_error',{engine:'javascript',reason:'unstable flow'});running=false;sim.reset();resetParticles();syncRunning();notify('The flow became unstable and was reset. Try a gentler speed or higher viscosity.');return 0;}
}

function engineLabel(message,fallback=false){
  $('engineStatus').textContent=message;
  $('engineStatus').dataset.fallback=String(fallback);
}
function resetRustField(){
  stabilityEvent('flow_reset',{engine:engineKind});
  if(!wasmActive||!wasmWorker)return;
  engineRevision++;
  workerInFlight=0;gpuFluidDirty=true;gpuParticleDebt=0;stepper.reset();gpuPaintPacer.reset();
  // Always copy the current obstacle mask; drag/draw tools modify it on the UI thread.
  wasmWorker.postMessage({type:'reset',revision:engineRevision,
    speed:sim.speed,viscosity:sim.viscosity,solid:sim.solid.slice()});
}
function showForceReadout(){
  const output=$('forceReadout');
  if(!$('force').checked){output.textContent='Force overlay off · enable it to compare relative drag and lift.';return;}
  if(engineKind==='webgpu'&&!gpuForceValid){output.textContent='Preparing GPU model force…';return;}
  output.textContent='Relative model force · Drag '+sim.forceX.toFixed(4)+
    ' · Lift '+(-sim.forceY).toFixed(4)+' · Resultant '+
    Math.hypot(sim.forceX,sim.forceY).toFixed(4)+' (not newtons)';
}
function syncGpuForce(){
  if(wasmActive&&engineKind==='webgpu'&&wasmWorker)
    wasmWorker.postMessage({type:'force',enabled:$('force').checked});
}
function updateRustParameters(){
  if(wasmActive&&wasmWorker)wasmWorker.postMessage({
    type:'params',speed:sim.speed,viscosity:sim.viscosity
  });
}
function endRustEngine(reason){
  cancelComparison('The flow engine changed. Start a fresh comparison so both views use the same engine.');
  stabilityEvent('fallback',{from:engineKind,reason});
  const wasGpu=engineKind==='webgpu';
  if(wasmWorker){wasmWorker.terminate();wasmWorker=null;}
  wasmActive=false;wasmStarting=false;workerInFlight=0;manualSteps=0;gpuParticleDebt=0;gpuFluidDirty=false;gpuPaintPacer.reset();
  engineKind='javascript';
  // JS fallback must have f64 velocity fields for normal numeric operation.
  sim.rho=new Float64Array(sim.n);
  sim.ux=new Float64Array(sim.n);
  sim.uy=new Float64Array(sim.n);
  sim.reset();pendingSteps=0;resetParticles();paint();
  gpuForceValid=false;showForceReadout();
  $('force').disabled=false;$('force').title='Show model force';
  if(wasGpu){
    engineLabel('WebGPU unavailable · switching to Rust/WASM',true);
    beginRustEngine('wasm');
    return;
  }
  engineLabel('JavaScript fallback · '+reason,true);
  if(reason!=='selected')notify('Rust/WASM unavailable. The JavaScript simulator is still working.');
}
function publishRustStep(count,budgetMs,now){
  if(!wasmActive||!wasmWorker||workerInFlight)return;
  count=comparison.limit(count,sim.time);
  workerInFlight=++workerRequest;
  lastWorkerRequest=now;
  wasmWorker.postMessage({type:'step',revision:engineRevision,
    requestId:workerInFlight,count,budgetMs});
}
function beginRustEngine(override=null){
  $('engine').value=engineChoice;
  if(!requestedWasm){
    engineLabel('JavaScript · selected');
    return;
  }
  if(typeof Worker==='undefined'){
    endRustEngine('Web Workers unavailable');return;
  }
  if((override==='wasm'||engineChoice==='wasm')&&typeof WebAssembly==='undefined'){
    endRustEngine('WebAssembly unavailable');return;
  }
  engineKind=override||(engineChoice==='wasm'?'wasm':'webgpu');
  if(engineKind==='webgpu'&&!navigator.gpu)engineKind='wasm';
  if(engineKind==='wasm'&&typeof WebAssembly==='undefined'){
    endRustEngine('WebAssembly unavailable');return;
  }
  wasmStarting=true;
  engineLabel('Loading '+(engineKind==='webgpu'?'WebGPU':'Rust/WASM')+'…');
  try{
    const worker=new Worker(new URL(engineKind==='webgpu'?'./student-gpu-worker-v3.mjs':'./student-wasm-worker.mjs',import.meta.url),{type:'module'});
    wasmWorker=worker;
    worker.onerror=event=>{
      event.preventDefault();
      endRustEngine('worker error');
    };
    worker.onmessage=({data})=>{
      if(worker!==wasmWorker)return;
      if(data.type==='ready'){
        wasmStarting=false;wasmActive=true;
        // The user could have changed controls while WASM was loading.
        sim.reset();resetParticles();pendingSteps=0;workerInFlight=0;stepper.reset();gpuPaintPacer.reset();gpuParticleDebt=0;gpuFluidDirty=true;
        resetRustField();
        gpuForceValid=false;
        const gpu=engineKind==='webgpu';
        $('force').disabled=gpu&&!data.forceOptIn;
        $('force').title=gpu
          ?'Experimental GPU-relative force. Adds GPU work when enabled; values are model units.'
          :'Show model force (relative simulation units)';
        if(gpu&&$('force').checked)syncGpuForce();
        engineLabel((engineChoice==='auto'?'Auto · ':'')+(gpu?'WebGPU worker · experimental':'Rust/WASM worker'),engineChoice==='webgpu'&&!gpu);
        notify(gpu?'WebGPU active. Force overlay is optional and experimental.':'Rust/WASM active. Flow restarted using your current settings.');
        showForceReadout();paint();
      }else if(data.type==='forceStatus'){
        if(data.enabled){
          gpuForceValid=false;
          $('force').disabled=false;
          $('force').title='GPU-relative force active · simulation units, not newtons';
        }else if(!data.available){
          stabilityEvent('force_error',{reason:data.message||'Force unavailable'});
          gpuForceValid=false;
          $('force').checked=false;
          $('force').disabled=true;
          $('force').title='GPU force feature unavailable on this browser · use Rust/WASM';
          sim.forceX=0;sim.forceY=0;
          notify(data.message||'GPU force is unavailable. The flow simulation remains active.');
          showForceReadout();paint();
        }else{
          gpuForceValid=false;
          sim.forceX=0;sim.forceY=0;showForceReadout();paint();
        }
      }else if(data.type==='error'){
        stabilityEvent('engine_error',{engine:engineKind,reason:data.message||'Worker error'});
        endRustEngine('simulation error');
      }else if(data.type==='skipped'){
        if(data.requestId===workerInFlight)workerInFlight=0;
      }else if(data.type==='frame'){
        if(data.requestId===workerInFlight)workerInFlight=0;
        if(data.revision!==engineRevision)return;
        if(engineKind==='webgpu'&&data.perf){
          const sample={timestamp:Date.now(),steps:data.steps,batchMode:$('batchMode').value,
            encodeMs:forceFrameTiming(data.perf.encodeMs),
            queueReadbackMs:forceFrameTiming(data.perf.queueReadbackMs),
            unpackMs:forceFrameTiming(data.perf.unpackMs),
            workerMs:forceFrameTiming(data.perf.workerMs),
            roundTripMs:forceFrameTiming(performance.now()-lastWorkerRequest),
            forceEnabled:data.perf.forceEnabled};
          bounded(gpuSamples,sample);stability.worker(sample,performance.now());windowGpuSnapshots++;
          if($('batchMode').value==='adaptive')
            stepper.observe({steps:data.steps,workerMs:data.perf.workerMs});
        }
        // Float32 fields are for drawing only. Rust/JS populations remain f64;
        // WebGPU retains f32 distributions in GPU buffers.
        const previous=[sim.rho,sim.ux,sim.uy];
        sim.rho=data.fields.rho;sim.ux=data.fields.ux;sim.uy=data.fields.uy;
        const buffers=previous.filter(v=>v instanceof Float32Array&&v.length===sim.n).map(v=>v.buffer);
        if(buffers.length===3)worker.postMessage({type:'recycle',buffers},buffers);
        sim.time=data.time;sim.inletSpeed=data.inletSpeed;
        sim.forceX=data.forceX;sim.forceY=data.forceY;
        gpuForceValid=engineKind==='webgpu'&&Boolean(data.forceAvailable);
        if($('force').checked)showForceReadout();
        simulatedSteps+=data.steps;
        pendingSteps=Math.max(0,pendingSteps-data.steps);
        if(engineKind==='webgpu'){
          if(data.steps>0)gpuParticleDebt=Math.min(MAX_TRACER_DEBT,gpuParticleDebt+data.steps);
          gpuFluidDirty=true; // Latest field is consumed by the independent Canvas scheduler.
        }else{
          if(data.steps>0)moveParticles(data.steps);
          if(performance.now()-lastPaint>=paintInterval){paint();lastPaint=performance.now();}
        }
        finishComparisonTrial();
      }
    };
    worker.postMessage({type:'init',width:W,height:H,speed:sim.speed,viscosity:sim.viscosity});
  }catch{
    endRustEngine('initialization failed');
  }
}

function frame(now) {
  const elapsed=lastFrame?Math.min(100,now-lastFrame):0;lastFrame=now;
  const drawing=pointer&&['draw','erase','move'].includes(pointer.action);
  if(running&&!document.hidden&&!drawing){
    const animation=Number($('animation').value),superFast=animation===24;
    const adaptiveGpu=wasmActive&&engineKind==='webgpu'&&$('batchMode').value==='adaptive';
    pendingSteps=Math.min(superFast?(adaptiveGpu?96:48):(adaptiveGpu?48:18),
      pendingSteps+elapsed*animation*.03);
    const count=Math.floor(pendingSteps);
    if(wasmActive){
      const adaptiveGpu=engineKind==='webgpu'&&$('batchMode').value==='adaptive';
      const sendCount=engineKind==='webgpu'
        ?Math.min(count,adaptiveGpu?stepper.batch:STEP_FIXED):count;
      if(sendCount&&!workerInFlight&&now-lastWorkerRequest>=Math.max(adaptiveGpu?1000/40:1000/30,paintInterval)){
        const budgetMs=useFastGrid?(superFast?34:25):(superFast?36:29);
        publishRustStep(sendCount,budgetMs,now);
      }
    }else if(count){
      const budgetMs=useFastGrid?(superFast?18:9):(superFast?36:12);
      pendingSteps-=runSteps(count,budgetMs);
      if(now-lastPaint>=paintInterval){paint();lastPaint=now;}
      finishComparisonTrial();
    }
  }else pendingSteps=0;
  if(wasmActive&&manualSteps>0&&!workerInFlight){
    const gpuLimit=$('batchMode').value==='adaptive'?stepper.batch:STEP_FIXED;
    const count=Math.min(engineKind==='webgpu'?gpuLimit:48,manualSteps);manualSteps-=count;
    publishRustStep(count,Number.POSITIVE_INFINITY,now);
  }
  if(wasmActive&&engineKind==='webgpu'&&!document.hidden&&gpuPaintPacer.shouldDraw({
    now,fluidDirty:gpuFluidDirty,tracerDebt:gpuParticleDebt,
    running:running||manualSteps>0,particlesEnabled:$('particles').checked
  })){
    if($('particles').checked&&gpuParticleDebt>0){
      // Divide bursts across frames for smoother tracers, but catch up to the
      // actual solver when GPU snapshots arrive faster than Canvas refreshes.
      const portion=Math.min(24,Math.ceil(gpuParticleDebt/2));
      moveParticles(portion);gpuParticleDebt-=portion;
    }else if(!$('particles').checked)gpuParticleDebt=0;
    gpuFluidDirty=false;paint();lastPaint=now;
  }
  if(now-performanceWindow>=1000){
    const seconds=(now-performanceWindow)/1000;
    lastCanvasFps=paintedFrames/seconds;
    lastFlowRate=simulatedSteps/seconds;
    lastSnapshotHz=windowGpuSnapshots/seconds;
    stability.rates({durationMs:now-performanceWindow,paints:paintedFrames,
      steps:simulatedSteps,snapshots:windowGpuSnapshots,...stabilityActivity()},now);
    windowGpuSnapshots=0;
    $('livePerformance').textContent=(wasmActive?(engineKind==='webgpu'?'WebGPU':'Rust/WASM'):'JS')+' · Canvas: '+Math.round(paintedFrames/seconds)+
      ' fps · Flow: '+Math.round(simulatedSteps/seconds)+' steps/s';
    performanceWindow=now;paintedFrames=0;simulatedSteps=0;
    refreshPerformance();
  }
  if(now-lastReadout>250&&!document.hidden){
    updateProbe();
    updateRunStatus();
    refreshComparison();
    lastReadout=now;
  }
  requestAnimationFrame(frame);
}
function updateRunStatus() {
  const settling=Math.abs(sim.inletSpeed-sim.speed)>.0003;
  const label=pointer?.action==='move'?'Moving object · release to restart':running?(settling?'Adjusting flow':'Running'):'Paused';
  $('runState').textContent=`${label} · ${sim.time.toLocaleString()} steps`;
  $('speedValue').title=settling?`Current inlet: ${sim.inletSpeed.toFixed(3)}; target: ${sim.speed.toFixed(3)}`:'Inlet flow speed';
}
function syncRunning() {
  if(!running)pendingSteps=0;
  if(stability.active)stability.observeState(stabilityConfig(),stabilityActivity(),performance.now());
  $('playButton').querySelector('span').textContent=running?'Pause':'Play';
  $('playIcon').innerHTML=running?'<path d="M6 4v12M14 4v12"/>':'<path d="m6 3 10 7-10 7V3Z"/>';
  $('runDot').classList.toggle('paused',!running);updateRunStatus();
  $('playButton').setAttribute('aria-label',running?'Pause simulation':'Play simulation');
  refreshComparison();
}
function press(group,value){document.querySelectorAll(`[data-${group}]`).forEach(el=>el.setAttribute('aria-pressed',String(el.dataset[group]===value)));}
function setView(next) {
  view=next;press('view',view);
  const info={curl:['Clockwise','Anticlockwise','Colour shows local rotation','linear-gradient(90deg,#faaf58,#102030,#55d4e6)'],speed:['Still','0.400+','Fixed scale · simulation units','linear-gradient(90deg,#0b1826,#1a87a9,#f7d067)'],density:['0.800−','1.200+','Density around the reference value 1','linear-gradient(90deg,#47cfde,#102030,#f5a856)']}[view];
  $('legendLow').textContent=info[0];$('legendHigh').textContent=info[1];$('legendNote').textContent=info[2];$('legendGradient').style.background=info[3];paint();
}
function shapeSelected(shape,angle=0,preservePosition=false) {
  shapeAppearance=null;
  sim.setShape(shape,angle,preservePosition?{x:sim.centerX,y:sim.centerY}:null);resetParticles();press('shape',shape);$('angle').value=angle;$('angleValue').textContent=`${angle}°`;
  const disabled=['custom','none'].includes(shape);$('angle').disabled=disabled;
  $('observation').innerHTML=notes[shape];$('canvasNote').textContent=shape==='none'?'Add a shape to disturb the flow':`Watch the wake behind the ${names[shape].toLowerCase()}`;
  if(shape!=='none'&&!preservePosition)toolSelected('move');
  pendingSteps=0;resetRustField();updateRunStatus();updateProbe();paint();
}
function flowReset(){if(!wasmActive)stabilityEvent('flow_reset',{engine:engineKind});sim.reset();pendingSteps=0;resetParticles();resetRustField();updateRunStatus();updateProbe();paint();}
function toolSelected(next) {
  tool=next;press('tool',tool);
  $('toolHint').textContent={move:'Drag the object to reposition it. Release to restart the flow. Arrow keys move it too.',probe:'Click anywhere in the flow to measure its speed.',draw:'Drag to draw a barrier. Leave space for the flow to go around it.',erase:'Drag across a barrier to erase it.',push:'Drag gently through the fluid to create a small disturbance.'}[tool];
  canvas.style.cursor=tool==='push'||tool==='move'?'grab':'crosshair';
}
function hitObject(p,radius=4) {
  for(let y=Math.max(0,Math.floor(p.y-radius));y<=Math.min(H-1,p.y+radius);y++)
    for(let x=Math.max(0,Math.floor(p.x-radius));x<=Math.min(W-1,p.x+radius);x++)
      if((x-p.x)**2+(y-p.y)**2<=radius*radius&&sim.solid[x+y*W])return true;
  return false;
}
function moveObjectBy(dx,dy) {
  const moved=sim.translateMask(sim.solid.slice(),dx,dy);
  if(moved){flowReset();return moved;}
  return null;
}
function position(event) {
  const r=canvas.getBoundingClientRect();return {x:Math.max(2,Math.min(W-3,(event.clientX-r.left)/r.width*W)),y:Math.max(2,Math.min(H-3,(event.clientY-r.top)/r.height*H))};
}
function editSegment(from,to) {
  shapeAppearance=null;
  const distance=Math.hypot(to.x-from.x,to.y-from.y),segments=Math.ceil(distance/1.5)||1;
  for(let i=0;i<=segments;i++){const t=i/segments;sim.brush(from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t,tool==='erase'?3:2,tool==='erase');}
  press('shape','custom');$('angle').disabled=true;$('observation').innerHTML=notes.custom;$('canvasNote').textContent='Your custom barrier';
}
canvas.addEventListener('pointerdown',event=>{
  if(comparison.active){notify('Exit the comparison to move the object. Both views must use the same position.');return;}
  if(event.button!==0||pointer)return;event.preventDefault();canvas.focus({preventScroll:true});
  const p=position(event);
  if(tool==='move'&&!hitObject(p,event.pointerType==='touch'?7:4)){notify('Drag the object itself. Choose a shape first if the tunnel is empty.');return;}
  pointer={...p,id:event.pointerId,action:tool};
  if(stability.active)stability.observeState(stabilityConfig(),stabilityActivity(),performance.now());
  if(tool==='move'){
    pointer.start={...p};pointer.origin={x:sim.centerX,y:sim.centerY};pointer.mask=sim.solid.slice();pointer.moved=false;
    canvas.style.cursor='grabbing';pendingSteps=0;
  }
  updateRunStatus();
  canvas.setPointerCapture(event.pointerId);
  if(tool==='probe'){sensor=p;updateProbe();}
  else if(tool==='draw'||tool==='erase')editSegment(p,p);
  paint();
});
canvas.addEventListener('pointermove',event=>{
  if(!pointer||event.pointerId!==pointer.id)return;
  const p=position(event);
  if(pointer.action==='move'){
    const result=sim.translateMask(pointer.mask,p.x-pointer.start.x,p.y-pointer.start.y,pointer.origin);
    pointer.moved=!!result&&(result.dx!==0||result.dy!==0);
  }else if(pointer.action==='probe'){sensor=p;updateProbe();}
  else if(pointer.action==='push'){
    if(wasmActive)wasmWorker.postMessage({type:'push',x:p.x,y:p.y,dx:p.x-pointer.x,dy:p.y-pointer.y});
    else sim.push(p.x,p.y,p.x-pointer.x,p.y-pointer.y);
  }
  else editSegment(pointer,p);
  pointer.x=p.x;pointer.y=p.y;paint();
});
function endPointer(event){
  if(!pointer||event.pointerId!==pointer.id)return;
  const reset=['draw','erase'].includes(pointer.action)||(pointer.action==='move'&&pointer.moved);
  pointer=null;
  if(stability.active)stability.observeState(stabilityConfig(),stabilityActivity(),performance.now());
  canvas.style.cursor=tool==='push'||tool==='move'?'grab':'crosshair';
  if(reset)flowReset();
  // When paused, refresh the flow visualization after using Stir.
  if(wasmActive&&tool==='push'&&!running&&!workerInFlight)
    publishRustStep(0,0,performance.now());
}
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);canvas.addEventListener('lostpointercapture',endPointer);
canvas.addEventListener('keydown',event=>{
  if(comparison.active&&event.key.startsWith('Arrow')){event.preventDefault();return;}
  const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(tool==='move'&&directions[event.key]&&!pointer){
    event.preventDefault();const [dx,dy]=directions[event.key],amount=event.shiftKey?5:1;
    if(!moveObjectBy(dx*amount,dy*amount))notify('Choose or draw a shape before moving it.');
  }
  if(tool==='probe'&&directions[event.key]){
    event.preventDefault();if(!sensor)sensor={x:W*.6,y:H*.5};const d=directions[event.key],step=event.shiftKey?5:1;
    sensor={x:Math.max(2,Math.min(W-3,sensor.x+d[0]*step)),y:Math.max(2,Math.min(H-3,sensor.y+d[1]*step))};updateProbe();paint();
  }
});
document.querySelectorAll('[data-shape]').forEach(el=>el.addEventListener('click',()=>shapeSelected(el.dataset.shape,Number($('angle').value))));
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.view)));
document.querySelectorAll('[data-tool]').forEach(el=>el.addEventListener('click',()=>toolSelected(el.dataset.tool)));
$('playButton').addEventListener('click',()=>{running=!running;syncRunning();});
$('stepButton').addEventListener('click',()=>{
  running=false;pendingSteps=0;
  if(wasmActive)manualSteps+=10;
  else {runSteps(10);paint();updateProbe();}
  syncRunning();
});
$('resetButton').addEventListener('click',flowReset);
$('clearButton').addEventListener('click',()=>shapeSelected('none',0));
$('closeSensor').addEventListener('click',()=>{sensor=null;$('sensorReadout').hidden=true;paint();});
$('angle').addEventListener('input',()=>shapeSelected(sim.shape,Number($('angle').value),true));
$('animation').addEventListener('change',()=>{pendingSteps=0;});
$('batchMode').value=tuningPreference==='adaptive'?'adaptive':'fixed';
$('batchMode').addEventListener('change',()=>{
  gpuParticleDebt=0;resetPerformance();
  notify('Workload mode changed · allow 5 seconds before comparing readings.');
});
$('resetPerformance').addEventListener('click',resetPerformance);
$('startStability')?.addEventListener('click',()=>{
  if(comparison.active)return;
  if(!running||document.hidden||wasmStarting||!wasmActive||engineKind!=='webgpu'){
    notify('Start the recording after WebGPU is active, the flow is running and this tab is visible.');return;
  }
  stability.start({durationMinutes:Number($('stabilityDuration').value),config:stabilityConfig(),
    now:performance.now(),wallTime:new Date().toISOString()});
  stabilityFinishedShown=false;refreshStability();
  stabilityTimer=setInterval(refreshStability,250);
});
$('stopStability')?.addEventListener('click',()=>{stability.stop(performance.now(),new Date().toISOString());refreshStability();});
$('exportStability')?.addEventListener('click',exportStability);
document.addEventListener('visibilitychange',()=>{
  stabilityEvent('visibility',{hidden:document.hidden});if(stability.active)refreshStability();
});
document.addEventListener('input',event=>{
  if(stability.active&&event.target!==$('stabilityDevice'))
    stability.observeState(stabilityConfig(),stabilityActivity(),performance.now());
});
document.addEventListener('change',()=>{
  if(stability.active)stability.observeState(stabilityConfig(),stabilityActivity(),performance.now());
});
window.addEventListener('pagehide',()=>{
  stabilityEvent('page_exit');stability.stop(performance.now(),new Date().toISOString());
  clearInterval(stabilityTimer);
},{once:true});

$('exportPerformance').addEventListener('click',exportPerformance);
$('quality').value=qualityOption;
$('engine').value=engineChoice;
$('engine').addEventListener('change',()=>{
  const url=new URL(location.href),choice=$('engine').value;
  if(choice==='auto')url.searchParams.delete('engine');
  else url.searchParams.set('engine',choice);
  location.assign(url.toString());
});
$('qualityStatus').textContent=useFastGrid?'Fast grid · 168 × 72':'Detailed grid · 240 × 104';
$('quality').addEventListener('change',()=>{
  const next=$('quality').value;
  const url=new URL(location.href);
  if(next==='auto')url.searchParams.delete('quality');
  else url.searchParams.set('quality',next);
  location.assign(url.toString());
});
$('speed').addEventListener('input',()=>{sim.speed=Number($('speed').value);$('speedValue').textContent=sim.speed.toFixed(3);updateRustParameters();updateRunStatus();paint();});
$('viscosity').addEventListener('input',()=>{sim.viscosity=Number($('viscosity').value);$('viscosityValue').textContent=sim.viscosity.toFixed(3);updateRustParameters();paint();});
['particles','vectors'].forEach(id=>$(id).addEventListener('change',paint));
$('force').addEventListener('change',()=>{
  gpuForceValid=false;
  syncGpuForce();
  if(!$('force').checked){sim.forceX=0;sim.forceY=0;}
  showForceReadout();paint();
});
$('viscosityInfo').addEventListener('click',()=>notify('Viscosity is a fluid’s resistance to shear. In this model, higher viscosity smooths out motion and can make swirls fade sooner.'));
$('fullscreenButton').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{notify('Fullscreen is not available here. You can use your browser’s fullscreen command.');}
});
$('guideButton').addEventListener('click',()=>$('guideDialog').showModal());
$('aboutButton').addEventListener('click',()=>$('aboutDialog').showModal());
document.querySelectorAll('.dialog-close').forEach(el=>el.addEventListener('click',()=>el.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
document.addEventListener('keydown',event=>{
  if(['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(document.activeElement?.tagName)||document.querySelector('dialog[open]'))return;
  if(event.code==='Space'&&comparison.phase!=='ready-b'){event.preventDefault();running=!running;syncRunning();}
  if(event.key.toLowerCase()==='r'&&!comparison.active)flowReset();
});

showForceReadout();
let demoPhase=0;
function setLevel(level){
  stabilityEvent('interface_mode',{level});
  document.body.dataset.level=level;press('level',level);
  if(level==='beginner'){toolSelected('move');if(view==='density')setView('curl');$('vectors').checked=false;$('force').checked=false;gpuForceValid=false;syncGpuForce();showForceReadout();paint();}
}
document.querySelectorAll('[data-level]').forEach(el=>el.addEventListener('click',()=>setLevel(el.dataset.level)));
$('demoButton').addEventListener('click',()=>{
  setLevel('beginner');sim.speed=.085;sim.viscosity=.025;$('speed').value=.085;$('speedValue').textContent='0.085';$('viscosity').value=.025;$('viscosityValue').textContent='0.025';
  $('animation').value='7';shapeSelected('block',0);setView('speed');running=true;syncRunning();demoPhase=1;$('nextDemo').hidden=false;
  $('demoStatus').textContent='Step 1/2: Watch the wake behind the block, then try the next shape.';
  $('canvasWrap').scrollIntoView({behavior:'smooth',block:'center'});
});
$('nextDemo').addEventListener('click',()=>{
  if(demoPhase!==1)return;shapeSelected('streamlined',0);setView('speed');running=true;syncRunning();demoPhase=2;$('nextDemo').hidden=true;
  $('demoStatus').textContent='Step 2/2: Same wind speed, different shape. How has the wake changed? Compare after similar simulation steps.';
  $('canvasWrap').scrollIntoView({behavior:'smooth',block:'center'});
});
const experiments={
  shapes:{label:'01 / SHAPE TEST',title:'Which shape leaves a narrower wake?',text:'Choose two shapes. Keep wind, viscosity, position and elapsed steps constant. “Equally tall” controls front-facing height, not length or area. Repeat to check your observation.',predict:'Which shape will leave a narrower wake?',observe:'Compare wake colours behind A and B.',explain:'Use a difference you can see to explain your answer.'},
  speed:{label:'02 / SPEED TEST',title:'What changes when the flow gets faster?',text:'Keep the circle and viscosity unchanged. Compare speeds of 0.040, 0.100 and 0.200. Use Reset flow for each fresh test, then compare after a similar number of steps.',predict:'Will faster flow create a different wake?',observe:'Compare the swirls and particle paths.',explain:'Describe one change you can actually see.'},
  angle:{label:'03 / ANGLE TEST',title:'What happens when you tilt the shape?',text:'Start with the streamlined shape at 0°. Try 20°, keeping flow speed and viscosity unchanged. Compare the flow above and below the shape.',predict:'Will the flow stay balanced on both sides?',observe:'Use direction arrows and the speed view.',explain:'Explain how the angle changed the flow.'}
};
function selectExperiment(next){
  experiment=next;press('experiment',next);const e=experiments[next];
  for(const [id,key]of [['challengeLabel','label'],['challengeTitle','title'],['challengeText','text'],['predictText','predict'],['observeText','observe'],['explainText','explain']])$(id).textContent=e[key];
  const options={shapes:['Block leaves a narrower wake','Streamlined leaves a narrower wake'],speed:['Faster flow changes the wake','Faster flow makes little difference'],angle:['Tilting changes the flow balance','Tilting makes little difference']}[next];
  $('prediction').options[1].textContent=options[0];$('prediction').options[2].textContent=options[1];$('prediction').value='';$('conclusion').value='';
  if($('guidedComparison'))$('guidedComparison').hidden=next!=='shapes';
  if(next==='shapes')syncComparisonChoices();
}
document.querySelectorAll('[data-experiment]').forEach(el=>el.addEventListener('click',()=>selectExperiment(el.dataset.experiment)));
function setupExperiment(){
  sim.viscosity=.025;sim.speed=experiment==='speed'?.040:.085;
  $('viscosity').value=sim.viscosity;$('viscosityValue').textContent=sim.viscosity.toFixed(3);$('speed').value=sim.speed;$('speedValue').textContent=sim.speed.toFixed(3);
  shapeSelected(experiment==='shapes'?chosenComparisonPair()[0]:experiment==='angle'?'streamlined':'circle',0);
  $('particles').checked=true;$('vectors').checked=experiment==='angle';setView(experiment==='angle'?'speed':'curl');
  toolSelected(document.body.dataset.level==='beginner'?'move':'probe');running=true;syncRunning();notify('Experiment ready. Predict, then start the matched shape comparison or explore freely.');
}
$('setupExperiment').addEventListener('click',setupExperiment);
function capture(comparisonInfo=null) {
  paint();const s=sensor?sim.sample(sensor.x,sensor.y):null;
  if(captures.length>=2){notify('Remove a captured view to make room for another.');return null;}
  const bounds=sim.obstacleBounds();
  const record={image:canvas.toDataURL('image/png'),shape:sim.shape,angle:sim.angle,position:{x:sim.centerX,y:sim.centerY},speed:sim.speed,inletSpeed:sim.inletSpeed,viscosity:sim.viscosity,steps:sim.time,view,engine:engineKind,grid:{width:W,height:H},shapeScale:sim.shapeScale,obstacleHeight:bounds?bounds.maxY-bounds.minY+1:0,animation:$('animation').value,batchMode:$('batchMode').value,particles:$('particles').checked,vectors:$('vectors').checked,forceEnabled:$('force').checked,comparison:comparisonInfo?.matched?comparisonInfo:null,probe:s&&!s.solid?s:null,force:$('force').checked&&(engineKind!=='webgpu'||gpuForceValid)?{drag:sim.forceX,lift:-sim.forceY,resultant:Math.hypot(sim.forceX,sim.forceY),units:'relative model force (simulation units)',snapshot:true}:null,note:''};
  record.experiment=experiment;
  record.geometryScale=shapeAppearance?.scale??sim.shapeScale;record.sizeMode=shapeAppearance?.sizeMode??'preset';
  captures.push(record);renderCaptures();notify(`View ${captures.length===1?'A':'B'} captured. ${captures.length===1?(record.comparison?'Describe A, then choose Observe B.':'Change one variable for your next view.'):'Compare the two views below.'}`);
  return {shape:record.shape,speed:record.speed,steps:record.steps,count:captures.length};
}
function renderCaptures() {
  const root=$('captures');root.replaceChildren();root.hidden=captures.length===0;
  captures.forEach((record,index)=>{
    const figure=document.createElement('figure');figure.className='capture-card';
    const image=document.createElement('img');image.src=record.image;image.alt=`Captured ${viewNames[record.view].toLowerCase()} view of ${names[record.shape].toLowerCase()} at speed ${record.speed.toFixed(3)}`;figure.append(image);
    const caption=document.createElement('figcaption');caption.className='capture-caption';
    const heading=document.createElement('div'),title=document.createElement('strong');title.textContent=`View ${index===0?'A':'B'} · ${names[record.shape]}`;
    const remove=document.createElement('button');remove.textContent='Remove';remove.disabled=comparison.active;remove.setAttribute('aria-label',`Remove view ${index===0?'A':'B'}`);remove.addEventListener('click',()=>{captures.splice(index,1);renderCaptures();});heading.append(title,remove);caption.append(heading);
    const meta=document.createElement('div');meta.textContent=`Speed ${record.speed.toFixed(3)} · Viscosity ${record.viscosity.toFixed(3)} · ${record.angle}° · ${record.steps.toLocaleString()} steps · ${viewNames[record.view]}`;caption.append(meta);
    const method=document.createElement('div');method.className='advanced-only';method.textContent=`${record.engine} · ${record.grid.width} × ${record.grid.height} grid · Height ${record.obstacleHeight} cells`;caption.append(method);
    if(record.comparison){const trial=document.createElement('div');trial.textContent=`Round ${record.comparison.round} · ${record.sizeMode==='matched-height'?'Equally tall shapes':'Original preset sizes'}`;caption.append(trial);}
    if(record.shape!=='none'){const location=document.createElement('div');location.textContent=`Object position (${record.position.x}, ${record.position.y})`;caption.append(location);}
    if(Math.abs(record.inletSpeed-record.speed)>.0003){const transition=document.createElement('div');transition.textContent=`Flow still adjusting: inlet ${record.inletSpeed.toFixed(3)} toward ${record.speed.toFixed(3)}.`;caption.append(transition);}
    if(record.force){const force=document.createElement('div');
      force.textContent='Model force snapshot · Drag '+record.force.drag.toFixed(4)+
      ' · Lift '+record.force.lift.toFixed(4)+' (relative units, not N)';
      caption.append(force);}
    if(record.probe){const probe=document.createElement('div');probe.textContent=`Probe (${record.probe.x}, ${record.probe.y}): speed ${record.probe.speed.toFixed(3)}`;caption.append(probe);}
    const label=document.createElement('label');label.textContent='What did you notice?';
    const text=document.createElement('textarea');text.placeholder='Describe the wake or particle paths…';text.value=record.note;text.addEventListener('input',()=>record.note=text.value);label.append(text);caption.append(label);
    const download=document.createElement('a');download.className='download';download.href=record.image;download.download=`airflow-${record.shape}-view-${index===0?'a':'b'}.png`;download.textContent='Download image';caption.append(download);figure.append(caption);root.append(figure);
  });
  if(captures.length===1){const empty=document.createElement('div');empty.className='capture-empty';empty.textContent='Your second view will appear here.';root.append(empty);}
  $('captureButton').disabled=comparison.active||captures.length>=2;
  $('exportComparison').disabled=captures.length!==2;
  if($('fairTestStatus')){
    $('fairTestStatus').hidden=captures.length!==2;
    if(captures.length===2){
      const differences=comparisonDifferences(...captures);
      $('fairTestStatus').textContent=differences.length
        ?`Check your comparison: ${differences.join(', ')}. Check that only the variable for your question changed.`
        :captures[0].experiment==='shapes'
          ?'Matched conditions: same wind, viscosity, position, angle, view, engine, grid and elapsed steps. Frontal heights match within one grid cell. Compare the wake; particle trails are visual markers.'
          :'Matched conditions: only the variable for your question changed. Other recorded settings and elapsed steps match. Use your observations as evidence.';
      $('fairTestStatus').dataset.matched=String(!differences.length);
    }
  }
  refreshComparison();
}
$('captureButton').addEventListener('click',()=>capture());
$('startComparison')?.addEventListener('click',startComparison);
$('nextComparison')?.addEventListener('click',()=>{
  if(comparison.phase!=='ready-b')return;
  comparison.next();prepareComparisonTrial();renderCaptures();
  $('canvasWrap').scrollIntoView({behavior:'smooth',block:'center'});
});
$('cancelComparison')?.addEventListener('click',()=>cancelComparison());
$('repeatComparison')?.addEventListener('click',repeatComparison);
['comparisonShapeA','comparisonShapeB','matchShapeHeight'].forEach(id=>$(id)?.addEventListener('change',()=>{
  if(comparison.active)return;
  $('prediction').value='';syncComparisonChoices();refreshComparison();
}));
function reportLines(c,text,x,y,width,spacing,max=2){
  const words=String(text||'No observation entered').split(/\s+/);let line='',count=0;
  for(const word of words){const next=line?line+' '+word:word;if(line&&c.measureText(next).width>width){c.fillText(line,x,y+spacing*count++);line=word;if(count>=max)return;}else line=next;}
  if(count<max)c.fillText(line,x,y+spacing*count);
}
async function exportReport(source=captures,saved=null){
 if(source.length!==2)return;
 // Freeze this report before loading images; edits during export cannot change it.
 const records=source.map(r=>structuredClone(r));
 const explanation=saved?saved.conclusion:$('conclusion').value;
 const repeatResult=saved?saved.repeatResult:($('repeatResult')?.value||'');
 const p=$('prediction');
 const recordedPrediction=records.every(r=>r.comparison?.matched)?records[0].comparison.prediction:(p.selectedIndex?p.options[p.selectedIndex].textContent:'Not recorded');
 const imageList=await Promise.all(records.map(item=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=item.image;})));
 const repeated=records.every(r=>r.comparison?.repeated);
 const sheet=document.createElement('canvas');sheet.width=1840;sheet.height=repeated?1010:920;const c=sheet.getContext('2d');
 c.fillStyle='#f3f6f8';c.fillRect(0,0,1840,sheet.height);c.fillStyle='#0e1824';c.fillRect(0,0,1840,125);
 c.fillStyle='#5de4d1';c.font='bold 36px sans-serif';c.fillText('AIRFLOW LAB / A–B COMPARISON',40,54);
 c.fillStyle='#e4eff2';c.font='22px sans-serif';c.fillText(experiments[records[0].experiment].title,40,94);
 records.forEach((r,n)=>{const x=40+n*920;c.fillStyle='#fff';c.fillRect(x,144,900,585);c.drawImage(imageList[n],x+10,155,880,381);
  c.fillStyle='#163445';c.font='bold 25px sans-serif';c.fillText('VIEW '+(n?'B':'A')+' · '+names[r.shape],x+12,574);
  c.fillStyle='#566c7c';c.font='19px sans-serif';c.fillText('Flow '+r.speed.toFixed(3)+' · Viscosity '+r.viscosity.toFixed(3)+' · Angle '+r.angle+'°',x+12,610);
  c.fillText(r.steps.toLocaleString()+' steps · '+viewNames[r.view],x+12,645);
  if(r.force){c.fillStyle='#0b766b';c.font='17px sans-serif';
     c.fillText('Force snapshot (relative): Drag '+r.force.drag.toFixed(4)+
       ' · Lift '+r.force.lift.toFixed(4),x+12,671);}
   c.fillStyle='#163445';c.font='18px sans-serif';reportLines(c,r.note,x+12,r.force?704:686,860,24,r.force?1:2);
 });
 c.font='19px sans-serif';c.fillStyle='#163445';
 reportLines(c,'Prediction: '+recordedPrediction,40,778,1740,25,1);
 reportLines(c,'Explanation: '+explanation,40,811,1740,26,2);
 c.fillStyle='#637989';c.font='17px sans-serif';c.fillText('Simplified 2D learning model · Simulation units · Not a calibrated aerodynamic test',40,892);
 c.font='16px sans-serif';c.fillStyle='#637989';
 const differences=comparisonDifferences(...records);
 reportLines(c,'Comparison check: '+(differences.length?differences.join(', '):'other recorded conditions match')+' · '+records[0].engine+' · '+records[0].grid.width+' × '+records[0].grid.height+' · '+(records[0].sizeMode==='matched-height'?'equal frontal height':'preset sizes'),40,867,1740,20,1);
 if(repeated){c.fillStyle='#163445';c.font='19px sans-serif';reportLines(c,`Repeat check · Round ${records[0].comparison.round}: ${({'similar':'The wake looked similar','different':'The wake looked different','unsure':'I am not sure yet'})[repeatResult]||'Not recorded'}. See the previous report for the earlier observations.`,40,947,1740,25,2);}
 sheet.toBlob(blob=>{if(!blob){notify('Report export unavailable on this device.');return;}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`airflow-lab-comparison${records[0].comparison?'-round-'+records[0].comparison.round:''}.png`;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);notify('Comparison report ready. Check your downloads.');
 },'image/png');
}
$('exportComparison').addEventListener('click',()=>exportReport().catch(()=>notify('Could not export report. Try downloading views separately.')));

// Optional browser-native tools share the visible controls and state.
const modelContext=navigator.modelContext||document.modelContext;
const lifecycle=new AbortController();
if(modelContext?.registerTool) {
  const register=definition=>{try{Promise.resolve(modelContext.registerTool(definition,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  const state=()=>({shape:sim.shape,position:{x:sim.centerX,y:sim.centerY},animation:Object.keys(animationModes).find(key=>animationModes[key]===Number($('animation').value)),angle:sim.angle,speed:sim.speed,inletSpeed:sim.inletSpeed,viscosity:sim.viscosity,view,running,steps:sim.time,captures:captures.length,probe:sensor?sim.sample(sensor.x,sensor.y):null});
  register({name:'read_wind_tunnel',description:'Read the current wind-tunnel settings and optional probe measurement.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>state()});
  register({name:'configure_wind_tunnel',description:'Change visible wind-tunnel settings. Shape or angle changes reset the fluid. Speed changes blend into the current flow; viscosity changes preserve it. Does not capture a view.',inputSchema:{type:'object',properties:{shape:{type:'string',enum:presetNames},angle:{type:'number',minimum:-45,maximum:45,multipleOf:5},speed:{type:'number',minimum:0,maximum:.2,multipleOf:.005},viscosity:{type:'number',minimum:.02,maximum:.15,multipleOf:.005},view:{type:'string',enum:['curl','speed','density']},running:{type:'boolean'},animation:{type:'string',enum:Object.keys(animationModes)}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{
    if(comparison.active)throw new Error('Exit the matched comparison before changing settings. Use the visible Pause button to pause.');
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a settings object.');
    const allowed=['shape','angle','speed','viscosity','view','running','animation'];
    if(Object.keys(input).some(k=>!allowed.includes(k)))throw new Error('Unknown setting.');
    if(input.shape!==undefined&&!presetNames.includes(input.shape))throw new Error('Unknown shape.');
    if(input.view!==undefined&&!['curl','speed','density'].includes(input.view))throw new Error('Unknown view.');
    for(const [key,min,max,step]of [['angle',-45,45,5],['speed',0,.2,.005],['viscosity',.02,.15,.005]])if(input[key]!==undefined&&(typeof input[key]!=='number'||!Number.isFinite(input[key])||input[key]<min||input[key]>max||Math.abs(input[key]/step-Math.round(input[key]/step))>1e-7))throw new Error(`Invalid ${key}.`);
    if(input.animation!==undefined&&!Object.hasOwn(animationModes,input.animation))throw new Error('Unknown animation speed.');
    if(input.running!==undefined&&typeof input.running!=='boolean')throw new Error('running must be boolean.');
    if(input.angle!==undefined&&['custom','none'].includes(input.shape??sim.shape))throw new Error('Choose a preset shape before setting its angle.');
    if(input.speed!==undefined){sim.speed=input.speed;$('speed').value=input.speed;$('speedValue').textContent=input.speed.toFixed(3);}
    if(input.viscosity!==undefined){sim.viscosity=input.viscosity;$('viscosity').value=input.viscosity;$('viscosityValue').textContent=input.viscosity.toFixed(3);}
    if(input.speed!==undefined||input.viscosity!==undefined)updateRustParameters();
    if(input.shape!==undefined||input.angle!==undefined)shapeSelected(input.shape??sim.shape,input.angle??sim.angle,input.shape===undefined);
    if(input.animation!==undefined){$('animation').value=animationModes[input.animation];pendingSteps=0;}
    if(input.view!==undefined)setView(input.view);
    if(input.running!==undefined){running=input.running;syncRunning();}
    updateProbe();paint();return state();
  }});
  register({name:'move_wind_tunnel_object',description:'Reposition the entire obstacle, keep it inside the tunnel, and restart the flow at its new position. Coordinates are simulation grid coordinates; returns the actual clamped position.',inputSchema:{type:'object',properties:{x:{type:'number',minimum:0,maximum:W-1},y:{type:'number',minimum:0,maximum:H-1}},required:['x','y'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{
    if(comparison.active)throw new Error('Exit the matched comparison before moving the object.');
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['x','y'].includes(key))||typeof input.x!=='number'||typeof input.y!=='number'||!Number.isFinite(input.x)||!Number.isFinite(input.y)||input.x<0||input.x>=W||input.y<0||input.y>=H)throw new Error('Provide valid x and y grid coordinates.');
    if(!moveObjectBy(input.x-sim.centerX,input.y-sim.centerY))throw new Error('Choose or draw an object first.');
    toolSelected('move');return state();
  }});
  register({name:'capture_wind_tunnel_view',description:'Capture the current rendered view for the visible two-view comparison. Fails when both slots are occupied or a matched comparison is active.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{if(comparison.active)throw new Error('Matched comparisons capture automatically.');if(captures.length>=2)throw new Error('Both comparison slots are full.');return capture();}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
syncComparisonChoices();setLevel(researchPage?'advanced':'beginner');resetParticles();syncRunning();setView('curl');toolSelected('move');beginRustEngine();requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{if(wasmWorker)wasmWorker.terminate();},{once:true});

