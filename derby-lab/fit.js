(function(global){
'use strict';
const defaults={wheelbase:90,length:150,clearance:10,bodyWidth:32,inner:38,wheelWidth:9};
const specs=[
 {key:'wheelbase',label:'Wheelbase',min:85,max:100,step:1},
 {key:'length',label:'Body length',min:140,max:160,step:1},
 {key:'clearance',label:'Chassis road clearance',min:8,max:10,step:.5},
 {key:'bodyWidth',label:'Body width',min:30,max:34,step:1},
 {key:'inner',label:'Wheel inner clearance',min:36,max:40,step:1},
 {key:'wheelWidth',label:'Wheel width',min:8,max:10,step:.5}
];
function sanitize(raw={}){return Object.fromEntries(specs.map(d=>[d.key,typeof raw?.[d.key]==='number'&&Number.isFinite(raw[d.key])?Math.max(d.min,Math.min(d.max,raw[d.key])):defaults[d.key]]));}
function validate(raw){if(raw===undefined)return {...defaults};if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid fit dimensions.');for(const d of specs)if(typeof raw[d.key]!=='number'||!Number.isFinite(raw[d.key])||raw[d.key]<d.min||raw[d.key]>d.max)throw Error('Invalid fit dimension: '+d.key);return sanitize(raw);}
function lower(points,x){let lo=0,hi=points.length-1;while(lo<hi){let m=(lo+hi)>>1;if(points[m][0]<x)lo=m+1;else hi=m;}return lo;}
function at(points,x,col=1){if(x<points[0][0]||x>points.at(-1)[0])return null;let i=lower(points,x);if(i===0)return points[0][col];const a=points[i-1],b=points[i],f=(x-a[0])/(b[0]-a[0]);return a[col]+f*(b[col]-a[col]);}
// Exact circular support over each segment of the extracted road polyline.
function wheelHeight(points,x,r){let z=-Infinity;const start=Math.max(0,lower(points,x-r)-1),end=lower(points,x+r);for(let i=start;i<Math.min(end+1,points.length-1);i++){const a=points[i],b=points[i+1],lo=Math.max(a[0],x-r),hi=Math.min(b[0],x+r);if(hi<lo)continue;const slope=(b[1]-a[1])/(b[0]-a[0]);const contact=Math.max(lo,Math.min(hi,x+r*slope/Math.hypot(1,slope)));const value=a[1]+slope*(contact-a[0])+Math.sqrt(Math.max(0,r*r-(contact-x)**2));z=Math.max(z,value);}return z;}
const cache=new WeakMap();
function envelope(data,r){let entry=cache.get(data);if(!entry){entry=new Map();cache.set(data,entry);}if(entry.has(r))return entry.get(r);const points=data.points,a=[];for(let x=points[0][0]+r;x<=points.at(-1)[0]-r;x+=.5)a.push([x,wheelHeight(points,x,r)]);entry.set(r,a);return a;}
function pose(data,centers,g,r,rearX){const rz=at(centers,rearX);if(rz===null||rearX+g.wheelbase>centers.at(-1)[0])return null;let lo=rearX,hi=rearX+g.wheelbase;for(let i=0;i<30;i++){const x=(lo+hi)/2,z=at(centers,x);if(Math.hypot(x-rearX,z-rz)<g.wheelbase)lo=x;else hi=x;}const fx=(lo+hi)/2,fz=at(centers,fx),x=(rearX+fx)/2,z=(rz+fz)/2,angle=Math.atan2(fz-rz,fx-rearX),ct=Math.cos(angle),st=Math.sin(angle),offset=g.clearance-r;
 const body=[[-g.length/2,offset],[g.length/2,offset]].map(([u,n])=>[x+u*ct-n*st,z+u*st+n*ct]);
 if(body.some(p=>p[0]<data.points[0][0]||p[0]>data.points.at(-1)[0]))return null;
 let gap=Infinity,hit=null;const points=data.points,start=Math.max(0,lower(points,Math.min(body[0][0],rearX)-r-20)-1),end=lower(points,Math.max(body[1][0],fx)+r+20);
 for(let i=start;i<Math.min(end+1,points.length-1);i++)for(const col of [1,2]){const a=points[i],b=points[i+1];const ta=(a[0]-x)*ct+(a[col]-z)*st,tb=(b[0]-x)*ct+(b[col]-z)*st,na=-(a[0]-x)*st+(a[col]-z)*ct,nb=-(b[0]-x)*st+(b[col]-z)*ct;
   let u0=0,u1=1;if(Math.abs(tb-ta)<1e-12){if(Math.abs(ta)>g.length/2)continue;}else{const aa=(-g.length/2-ta)/(tb-ta),bb=(g.length/2-ta)/(tb-ta);u0=Math.max(0,Math.min(aa,bb));u1=Math.min(1,Math.max(aa,bb));if(u0>u1)continue;}
   for(const u of [u0,u1]){const clearance=offset-(na+u*(nb-na));if(clearance<gap){gap=clearance;const local=ta+u*(tb-ta);hit={x:a[0]+u*(b[0]-a[0]),z:a[col]+u*(b[col]-a[col]),local,part:local< -g.wheelbase/2?'Rear overhang':local>g.wheelbase/2?'Front overhang':'Between axles',surface:col===2?'Guide':'Road'};}}
 }
 return {rearX,frontX:fx,x,z,angle,rear:[rearX,rz],front:[fx,fz],body,gap,hit};
}
function analyze(data,raw,r=15,step=2){const g=validate(raw);if(!(r>=8&&r<=25&&Number.isFinite(r)))throw Error('Wheel radius must be 8–25 mm.');if(!(step>0&&Number.isFinite(step)))throw Error('Invalid scan step.');const centers=envelope(data,r),samples=[];let worst=null;for(let x=centers[0][0];x<=centers.at(-1)[0]-g.wheelbase;x+=step){const p=pose(data,centers,g,r,x);if(!p)continue;samples.push(p);if(!worst||p.gap<worst.gap)worst=p;}return {g,r,samples,worst,step,guideSideGap:(g.inner-data.guideWidth)/2,treadEdgeGap:data.laneHalfWidth-(g.inner/2+g.wheelWidth),overallWidth:g.inner+2*g.wheelWidth,bodyWheelGap:(g.inner-g.bodyWidth)/2};}
const api={defaults,specs,sanitize,validate,at,wheelHeight,envelope,pose,analyze};global.DerbyFit=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
