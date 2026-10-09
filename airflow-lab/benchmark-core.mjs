// Shared experiment runner: exactly the same solver and initial state in both CPU modes.
import {FluidSimulation} from './simulation.mjs';

export const GRID_OPTIONS = Object.freeze({
  fast: {width:168,height:72,label:'Fast · 168 × 72'},
  detail:{width:240,height:104,label:'Detailed · 240 × 104'}
});
export const VALID_SHAPES=Object.freeze(['circle','block','streamlined','plate','car','bird','pikachu']);
export const VALID_SPEEDS=Object.freeze([0.04,0.085,0.15]);
export const VALID_STEPS=Object.freeze([50,150,500]);
export const WARMUP_STEPS=8;

export function validateConfig(input) {
  if(!input||!Object.hasOwn(GRID_OPTIONS,input.grid))throw new Error('Invalid grid');
  if(!VALID_SHAPES.includes(input.shape))throw new Error('Invalid shape');
  if(!VALID_SPEEDS.includes(Number(input.speed)))throw new Error('Invalid flow speed');
  if(!VALID_STEPS.includes(Number(input.steps)))throw new Error('Invalid step count');
  const {width,height}=GRID_OPTIONS[input.grid];
  return {grid:input.grid,width,height,shape:input.shape,speed:Number(input.speed),
    steps:Number(input.steps),warmup:WARMUP_STEPS};
}

export function configKey(config) {
  return [config.grid,config.shape,config.speed,config.steps,config.warmup].join('|');
}

export function summarize(sim) {
  // Full-field summaries make numerical differences visible, not just screenshot differences.
  let density=0,xVelocity=0,yVelocity=0,energy=0,solids=0;
  for(let i=0;i<sim.n;i++){
    if(sim.solid[i]){solids++;continue;}
    const rho=sim.rho[i],u=sim.ux[i],v=sim.uy[i];
    density+=rho;xVelocity+=u;yVelocity+=v;energy+=u*u+v*v;
  }
  const count=sim.n-solids;
  const nx=64,ny=28,colors=[],mask=[];
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const sx=Math.min(sim.width-1,Math.floor((x+.5)*sim.width/nx));
    const sy=Math.min(sim.height-1,Math.floor((y+.5)*sim.height/ny));
    const index=sx+sy*sim.width;
    colors.push(Math.min(255,Math.max(0,Math.round(Math.hypot(sim.ux[index],sim.uy[index])/.20*255))));
    mask.push(sim.solid[index]);
  }
  return {metrics:[density/count,xVelocity/count,yVelocity/count,energy/count],
    solidCells:solids,nonSolidCells:count,preview:{width:nx,height:ny,speeds:colors,solids:mask}};
}

export async function runCpuTrial(rawConfig,{onProgress=()=>{},checkCancelled=()=>false}={}) {
  const config=validateConfig(rawConfig);
  const sim=new FluidSimulation(config.width,config.height);
  sim.speed=config.speed;sim.viscosity=.025;sim.setShape(config.shape,0);
  // Warmup is identical for both CPU modes and excluded from timings.
  for(let i=0;i<config.warmup;i++){if(checkCancelled())throw new Error('Cancelled');sim.step();}
  const wallStart=performance.now();
  let computeMs=0,done=0,reported=0;
  const chunkSize=config.grid==='fast'?5:3;
  while(done<config.steps){
    if(checkCancelled())throw new Error('Cancelled');
    const end=Math.min(config.steps,done+chunkSize);
    const start=performance.now();
    while(done<end){sim.step();done++;}
    computeMs+=performance.now()-start;
    if(done-reported>=12||done===config.steps){reported=done;onProgress({done,total:config.steps});}
    if(done<config.steps)await new Promise(resolve=>setTimeout(resolve,0));
  }
  const wallMs=performance.now()-wallStart;
  const summary=summarize(sim);
  return {...config,computeMs,wallMs,stepsPerSecond:1000*config.steps/Math.max(.001,computeMs),
    ...summary,finishedAt:new Date().toISOString()};
}

export function compareFields(a,b){
  if(!a||!b)return null;
  if(a.length!==b.length)return {matches:false,maxDifference:Infinity};
  let worst=0;
  for(let i=0;i<a.length;i++)worst=Math.max(worst,Math.abs(a[i]-b[i]));
  return {matches:worst<1e-9,maxDifference:worst};
}
