import {trailOpacity} from './engine.js?v=3';
export function drawFadingTrail(ctx,sim,color='221,157,100'){
 if(sim.trail.length<2)return;
 ctx.save();ctx.lineWidth=2.5;ctx.lineCap='round';ctx.lineJoin='round';
 // Group equal opacity levels so a long trace does not require one stroke per point.
 for(let level=1;level<=20;level++){
  ctx.beginPath();let connected=false;
  for(let i=1;i<sim.trail.length;i++){
   const a=sim.trail[i-1],b=sim.trail[i];
   if(Math.ceil(trailOpacity(sim.distance-b.distance,sim.loopLength)*20)!==level){connected=false;continue;}
   if(!connected)ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);connected=true;
  }
  ctx.strokeStyle=`rgba(${color},${level/20*.8})`;ctx.stroke();
 }
 ctx.restore();
}
