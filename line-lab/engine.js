export const DT = 0.02;
export const MODEL_VERSION = 3;
export const MOTOR_MAX = 100;
export const MOTOR_MIN = -50;
export const MOTOR_SCALE = 4.5;
export const weights = [-2, -1, 0, 1, 2];
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const trackNames = {loop:'Practice loop',curves:'S-curves',tight:'Tight turns'};
export const defaults = {mode:'pid',track:'curves',base:70,kp:18,ki:1.5,kd:6,turn:26,deadband:0.35,bias:0,slowdown:0};
export const experiments = {
 rules:{mode:'rules',track:'loop',base:35,turn:15,deadband:.35,bias:0},
 damping:{mode:'p',track:'curves',base:75,kp:18,kd:6,ki:0,bias:0},
 integral:{mode:'pd',track:'loop',base:55,kp:18,kd:6,ki:3,bias:20},
 fast:{mode:'pid',track:'curves',base:80,kp:18,kd:6,ki:1.5,bias:0}
};
function spline(points) {
 const out=[];
 for(let i=0;i<points.length;i++) for(let j=0;j<60;j++) {
  const t=j/60,t2=t*t,t3=t2*t;
  const ps=[points[(i-1+points.length)%points.length],points[i],points[(i+1)%points.length],points[(i+2)%points.length]];
  const p=ps[0].map((_,k)=>0.5*((2*ps[1][k])+(-ps[0][k]+ps[2][k])*t+(2*ps[0][k]-5*ps[1][k]+4*ps[2][k]-ps[3][k])*t2+(-ps[0][k]+3*ps[1][k]-3*ps[2][k]+ps[3][k])*t3));
  out.push({x:p[0],y:p[1]});
 }
 return out;
}
export function makeTrack(name) {
 if(name==='curves') return spline([[250,135],[425,180],[610,120],[795,180],[785,385],[640,445],[475,370],[310,450],[125,390],[120,215]]);
 if(name==='tight') return spline([[230,120],[690,120],[805,205],[700,290],[790,415],[620,460],[500,335],[355,460],[140,410],[150,230]]);
 return Array.from({length:600},(_,i)=>{const a=i/600*Math.PI*2;return {x:480+340*Math.sin(a),y:290-170*Math.cos(a)};});
}
export function nearest(path,x,y) {
 let d2=Infinity,px=0,py=0,index=0;
 for(let i=0;i<path.length;i++) {
  const a=path[i],b=path[(i+1)%path.length],dx=b.x-a.x,dy=b.y-a.y;
  const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1);
  const qx=a.x+t*dx,qy=a.y+t*dy,dd=(x-qx)**2+(y-qy)**2;
  if(dd<d2){d2=dd;px=qx;py=qy;index=i+t;}
 }
 return {d:Math.sqrt(d2),x:px,y:py,index};
}
export function sensorError(values) {
 const sum=values.reduce((a,b)=>a+b,0);
 return Math.max(...values)<0.12||sum<0.2 ? null : values.reduce((a,b,i)=>a+b*weights[i],0)/sum;
}
export function pathLength(path){return path.reduce((sum,p,i)=>sum+Math.hypot(p.x-path[(i+1)%path.length].x,p.y-path[(i+1)%path.length].y),0);}
export function trailOpacity(age,loopLength){
 const t=clamp((age/Math.max(1,loopLength)-0.75)/0.25,0,1);
 return 1-t*t*(3-2*t);
}
export class Simulation {
 constructor(config={}) {this.config={...defaults,...config};this.reset();}
 reset() {
  this.path=makeTrack(this.config.track);this.loopLength=pathLength(this.path);this.distance=0;
  const a=this.path[0],b=this.path[1];
  this.car={x:a.x,y:a.y,angle:Math.atan2(b.y-a.y,b.x-a.x),vl:0,vr:0};
  this.time=0;this.integral=0;this.previous=null;this.derivative=0;this.lastSide=1;
  this.error=0;this.sensors=[];this.visible=true;this.lostFor=0;this.lostEvents=0;
  this.laps=0;this.travel=0;this.lastIndex=0;this.total=0;this.seen=0;this.errorSum=0;
  this.targetSpeed=0;this.left=0;this.right=0;this.correction=0;this.raw=0;this.p=0;this.i=0;this.d=0;
  this.history=[];this.trail=[];this.reason='Ready to read the line';this.finished=false;
  this.read();
 }
 resetMemory(){this.integral=0;this.previous=null;this.derivative=0;}
 read() {
  const c=this.car,cos=Math.cos(c.angle),sin=Math.sin(c.angle);
  this.sensors=weights.map(w=>{const x=c.x+22*cos-w*12*sin,y=c.y+22*sin+w*12*cos;const dist=nearest(this.path,x,y).d;return {x,y,value:clamp((12-dist)/6,0,1)};});
  this.error=sensorError(this.sensors.map(s=>s.value));this.visible=this.error!==null;
 }
 control() {
  const cfg=this.config,e=this.error;
  if(e===null) {
   this.targetSpeed=0;this.lostFor+=DT;this.previous=null;this.derivative=0;this.p=0;this.i=0;this.d=0;this.raw=0;
   this.left=this.lastSide*22;this.right=-this.lastSide*22;this.correction=this.lastSide*22;
   this.reason='No line seen → search toward the last seen side';return;
  }
  this.lostFor=0;if(Math.abs(e)>0.08)this.lastSide=Math.sign(e);
  this.derivative+=0.2*((this.previous===null?0:(e-this.previous)/DT)-this.derivative);this.previous=e;
  this.p=cfg.kp*e;this.i=0;this.d=0;
  if(cfg.mode==='rules') {
   this.raw=e>cfg.deadband?cfg.turn:e < -cfg.deadband?-cfg.turn:0;
   this.p=0;this.reason=this.raw===0?'Line near the middle → go straight':this.raw>0?'Line on the right → turn right':'Line on the left → turn left';
  } else {
   if(cfg.mode==='pd'||cfg.mode==='pid')this.d=cfg.kd*this.derivative;
   if(cfg.mode==='pid') {
    const candidate=clamp(this.integral+e*DT,-12,12),next=cfg.kp*e+cfg.ki*candidate+this.d;
    const limit=MOTOR_MAX;
    if(Math.abs(next)<=limit||Math.sign(e)!==Math.sign(next))this.integral=candidate;
    this.i=cfg.ki*this.integral;
   }
   this.raw=this.p+this.i+this.d;
   this.reason=Math.abs(this.raw)<0.25?'Correction is small → nearly straight':this.raw>0?'Positive correction → left wheel faster → turn right':'Negative correction → right wheel faster → turn left';
  }
  this.correction=clamp(this.raw,-MOTOR_MAX,MOTOR_MAX);
  // Clamp each motor independently: high forward speed must not erase steering.
  // Speed policy uses only the five sensor readings, never map curvature.
  this.targetSpeed=cfg.base*(1-clamp(cfg.slowdown||0,0,.85)*Math.min(1,Math.abs(e)/2));
  this.left=clamp(this.targetSpeed+this.correction,MOTOR_MIN,MOTOR_MAX);this.right=clamp(this.targetSpeed-this.correction,MOTOR_MIN,MOTOR_MAX);
 }
 tick() {
  if(this.finished)return;
  this.read();const seenBefore=this.visible;this.control();
  if(!this.visible&&this.history.at(-1)?.e!==null)this.lostEvents++;
  this.total++;if(this.visible){this.seen++;this.errorSum+=Math.abs(this.error);}
  const c=this.car;
  for(let k=0;k<10;k++) {
   const dt=DT/10,scale=MOTOR_SCALE;
   c.vl+=(this.left*scale-c.vl)*dt/0.1;
   c.vr+=(this.right*scale*(1-this.config.bias/100)-c.vr)*dt/0.1;
   const v=(c.vl+c.vr)/2;c.angle+=(c.vl-c.vr)/30*dt;
   c.x+=v*Math.cos(c.angle)*dt;c.y+=v*Math.sin(c.angle)*dt;this.distance+=Math.abs(v)*dt;
  }
  this.time+=DT;
  const n=nearest(this.path,c.x,c.y);let di=n.index-this.lastIndex;
  if(di < -this.path.length/2)di+=this.path.length;if(di>this.path.length/2)di-=this.path.length;
  if(n.d<45&&seenBefore)this.travel+=di;
  this.lastIndex=n.index;this.laps=Math.max(0,Math.floor(this.travel/this.path.length));
  this.history.push({t:this.time,e:this.error,p:this.p,i:this.i,d:this.d});if(this.history.length>Math.round(12/DT))this.history.shift();
  this.trail.push({x:c.x,y:c.y,distance:this.distance});
  while(this.trail.length>1&&(this.distance-this.trail[1].distance>=this.loopLength||this.trail.length>2000))this.trail.shift();
  if(this.lostFor>=5||c.x<15||c.x>945||c.y<15||c.y>565)this.finished=true;
 }
 get meanError(){return this.seen?this.errorSum/this.seen:0;}
 get seenPercent(){return this.total?this.seen/this.total*100:100;}
 nudge(side=1){this.car.x-=Math.sin(this.car.angle)*14*side;this.car.y+=Math.cos(this.car.angle)*14*side;this.resetMemory();this.read();this.finished=false;this.lostFor=0;}
}

