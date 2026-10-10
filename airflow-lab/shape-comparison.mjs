import {FluidSimulation} from './simulation.mjs';

export const COMPARISON_STEPS=2000;
export const COMPARISON_SHAPES=['circle','block','streamlined','plate','car','bird','pikachu'];

function shapeGeometry(preview,shape,targetHeight){
  const baseScale=preview.width/240;
  preview.shapeScale=baseScale;preview.setShape(shape,0);
  let bounds=preview.obstacleBounds(),best={scale:baseScale,height:bounds.maxY-bounds.minY+1,width:bounds.maxX-bounds.minX+1};
  if(targetHeight){
    let low=baseScale*.35,high=baseScale*2;
    for(let i=0;i<18&&best.height!==targetHeight;i++){
      const scale=(low+high)/2;preview.shapeScale=scale;preview.setShape(shape,0);
      bounds=preview.obstacleBounds();const height=bounds.maxY-bounds.minY+1;
      if(Math.abs(height-targetHeight)<Math.abs(best.height-targetHeight))best={scale,height,width:bounds.maxX-bounds.minX+1};
      if(height<targetHeight)low=scale;else high=scale;
    }
    if(Math.abs(best.height-targetHeight)>1)throw new Error('Could not match the shape heights on this grid.');
  }
  return best;
}

// Use the existing preset geometry. Choose one position that fits BOTH masks,
// even when a student starts with an obstacle close to an edge.
export function comparisonPlan(settings){
  const preview=new FluidSimulation(settings.grid.width,settings.grid.height);
  const pair=settings.pair??['block','streamlined'];
  if(!Array.isArray(pair)||pair.length!==2||pair.some(shape=>!COMPARISON_SHAPES.includes(shape))||pair[0]===pair[1])throw new Error('Choose two different preset shapes.');
  const matchHeight=settings.matchHeight!==false;
  preview.setShape('block',0);const b=preview.obstacleBounds(),targetHeight=b.maxY-b.minY+1;
  const geometry=Object.fromEntries(pair.map(shape=>[shape,shapeGeometry(preview,shape,matchHeight?targetHeight:null)]));
  const extents=Object.values(geometry).map(({width,height})=>({left:Math.floor((width-1)/2),right:Math.ceil((width-1)/2),top:Math.floor((height-1)/2),bottom:Math.ceil((height-1)/2)}));
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Math.round(v)));
  return {...structuredClone(settings),pair:[...pair],matchHeight,targetHeight:matchHeight?targetHeight:null,geometry,angle:0,targetSteps:COMPARISON_STEPS,
    position:{
      x:clamp(settings.position.x,8+Math.max(...extents.map(b=>b.left)),preview.width-9-Math.max(...extents.map(b=>b.right))),
      y:clamp(settings.position.y,8+Math.max(...extents.map(b=>b.top)),preview.height-9-Math.max(...extents.map(b=>b.bottom)))
    }};
}

// Only the guided obstacle is uniformly scaled. Existing solver kernels and
// free-exploration presets stay unchanged. Align bounding-box centres within
// half a raster cell, rather than comparing different preset anchor offsets.
export function setComparisonShape(sim,plan,shape){
  const scale=sim.shapeScale,spec=plan.geometry[shape];
  if(!spec)throw new Error('The shape is not part of this comparison.');
  try{
    sim.shapeScale=spec.scale;sim.setShape(shape,0);
    const b=sim.obstacleBounds();
    sim.translateMask(sim.solid.slice(),Math.round(plan.position.x-(b.minX+b.maxX)/2),Math.round(plan.position.y-(b.minY+b.maxY)/2));
    sim.centerX=plan.position.x;sim.centerY=plan.position.y;sim.reset();
  }finally{sim.shapeScale=scale;}
  return {scale:spec.scale,sizeMode:plan.matchHeight?'matched-height':'preset'};
}

export function comparisonDifferences(a,b){
  const differences=[];
  const variable=a.experiment==='speed'?'speed':a.experiment==='angle'?'angle':'shape';
  for(const [key,label]of [['speed','wind speed'],['viscosity','viscosity'],['angle','angle'],
    ['steps','elapsed steps'],['view','colour view'],['engine','engine'],['shapeScale','preset scale'],
    ['animation','animation pace'],['batchMode','workload'],['particles','particles'],['vectors','arrows'],['forceEnabled','force setting']]){
    if(key!==variable&&a[key]!==b[key])differences.push(label);
  }
  if(a.sizeMode!==b.sizeMode)differences.push('size method');
  if(variable!=='shape'&&a.geometryScale!==b.geometryScale)differences.push('object size');
  if(a.experiment!==b.experiment)differences.push('different questions');
  if(a.position?.x!==b.position?.x||a.position?.y!==b.position?.y)differences.push('object position');
  if(a.grid?.width!==b.grid?.width||a.grid?.height!==b.grid?.height)differences.push('grid');
  if(Math.abs(a.inletSpeed-a.speed)>.0003||Math.abs(b.inletSpeed-b.speed)>.0003)differences.push('flow still adjusting');
  if(a[variable]===b[variable])differences.push(`same ${variable} in both views`);
  if(variable!=='shape'&&a.shape!==b.shape)differences.push('shape');
  if(variable!=='angle'&&Number.isFinite(a.obstacleHeight)&&Number.isFinite(b.obstacleHeight)&&Math.abs(a.obstacleHeight-b.obstacleHeight)>1)differences.push('front-facing height');
  return differences;
}

export function createMatchedComparison(){
  let phase='idle',plan=null;
  return {
    get active(){return ['running-a','ready-b','running-b'].includes(phase);},
    get running(){return ['running-a','running-b'].includes(phase);},
    get phase(){return phase;},
    get plan(){return plan?structuredClone(plan):null;},
    get shape(){return plan?.pair[phase==='running-b'?1:0]??'block';},
    start(settings){if(this.active)throw new Error('A comparison is already active.');plan=comparisonPlan(settings);phase='running-a';return this.plan;},
    remaining(time){return this.running?Math.max(0,plan.targetSteps-time):Infinity;},
    limit(count,time){return Math.min(count,this.remaining(time));},
    complete(time){
      if(!this.running)return false;
      if(time<plan.targetSteps)return false;
      if(time!==plan.targetSteps){phase='failed';throw new Error('The observation point was missed. Start a fresh comparison.');}
      phase=phase==='running-a'?'ready-b':'done';return true;
    },
    next(){if(phase!=='ready-b')throw new Error('Capture A before starting B.');phase='running-b';},
    cancel(){phase='cancelled';}
  };
}

export function seededRandom(seed=42){
  let state=seed>>>0;
  return ()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
}
