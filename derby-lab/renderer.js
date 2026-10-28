(function(global){
'use strict';
class DerbyRenderer{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.yaw=-.38;this.elevation=.34;this.zoom=1;this.drag=null;this.view='perspective';this.last=null;
 canvas.addEventListener('pointerdown',e=>{this.drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!this.drag)return;this.yaw+=(e.clientX-this.drag.x)*.006;this.elevation=Math.max(.08,Math.min(1.5,this.elevation+(e.clientY-this.drag.y)*.006));this.drag={x:e.clientX,y:e.clientY};this.view='perspective';this.redraw();});
 canvas.addEventListener('pointerup',()=>this.drag=null);canvas.addEventListener('pointercancel',()=>this.drag=null);
 canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.65,Math.min(2.5,this.zoom*Math.exp(-e.deltaY*.001)));this.redraw();},{passive:false});
 new ResizeObserver(()=>this.redraw()).observe(canvas);
 }
 setView(view){this.view=view;this.zoom=1;if(view==='side'){this.yaw=0;this.elevation=.05;}else if(view==='top'){this.yaw=0;this.elevation=1.5;}else{this.yaw=-.38;this.elevation=.34;}this.redraw();}
 redraw(){if(this.last)this.draw(...this.last);}
 draw(run,sample,ghost){this.last=[run,sample,ghost];const ctx=this.ctx,canvas=this.canvas,w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const road=run.track.road,low=Math.min(...road.map(p=>p.z)),high=Math.max(...road.map(p=>p.z)),floor=low-.09,center={x:(road[0].x+road.at(-1).x)/2,y:0,z:(high+low)/2};
 const cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),ce=Math.cos(this.elevation),se=Math.sin(this.elevation),distance=4;
 const camera=p=>{const x=p[0]-center.x,y=p[1],z=p[2]-center.z,across=-sy*x+cy*y,depth=across*ce+z*se,k=1/(1-depth/distance);return {u:(cy*x+sy*y)*k,v:(z*ce-across*se)*k,depth};};
 const bounds=road.filter((_,i)=>i%10===0).flatMap(p=>[-.08,.08].map(y=>camera([p.x,y,p.z])));const us=bounds.map(p=>p.u),vs=bounds.map(p=>p.v),umin=Math.min(...us),umax=Math.max(...us),vmin=Math.min(...vs),vmax=Math.max(...vs),scale=Math.min((w-65)/(umax-umin),(h-90)/Math.max(.17,vmax-vmin))*this.zoom;
 const project=p=>{const q=camera(p);return {x:w/2+(q.u-(umin+umax)/2)*scale,y:h/2-9-(q.v-(vmin+vmax)/2)*scale,d:q.depth};};
 const line=(points,color,width=1,dash=[])=>{ctx.beginPath();points.forEach((p,i)=>{let a=project(p);i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y);});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);};
 for(let x=-.2;x<2.3;x+=.15)line([[x,-.5,floor],[x,.5,floor]],'#263336',.7);
 for(let y=-.45;y<=.45;y+=.15)line([[-.2,y,floor],[2.3,y,floor]],'#263336',.7);
 // A soft projected footprint anchors the elevated track in space.
 ctx.save();ctx.globalAlpha=.16;ctx.strokeStyle='#05090a';ctx.lineWidth=Math.max(3,scale*.13);ctx.lineCap='round';ctx.beginPath();road.filter((_,i)=>i%12===0).forEach((p,i)=>{const a=project([p.x,.02,floor+.002]);i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y);});ctx.stroke();ctx.restore();
 const polygons=[];const poly=(ps,color,alpha=1)=>polygons.push({ps,color,alpha,depth:ps.reduce((s,p)=>s+camera(p).depth,0)/ps.length});
 const box=(x0,x1,y0,y1,z0,z1,color)=>{poly([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],color);poly([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],'#334649');poly([[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]],'#29383a');poly([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],'#405356');};
 for(let i=30;i<road.length;i+=115){let p=road[i];box(p.x-.012,p.x+.012,-.059,-.047,floor,p.z-.012,'#536564');box(p.x-.012,p.x+.012,.047,.059,floor,p.z-.012,'#536564');box(p.x-.03,p.x+.03,-.077,.077,floor,floor+.012,'#3e5051');}
 for(let i=0;i<road.length-1;i+=5){const a=road[i],b=road[Math.min(road.length-1,i+5)],z0=a.z,z1=b.z;
 poly([[a.x,-.07525,z0],[b.x,-.07525,z1],[b.x,.07525,z1],[a.x,.07525,z0]],'#b0a181');
 poly([[a.x,-.07525,z0-.008],[b.x,-.07525,z1-.008],[b.x,-.07525,z1],[a.x,-.07525,z0]],'#726951');
 poly([[a.x,.07525,z0-.008],[b.x,.07525,z1-.008],[b.x,.07525,z1],[a.x,.07525,z0]],'#8d8062');
 for(const y of [-.037625,.037625]){poly([[a.x,y-.016,z0+.004],[b.x,y-.016,z1+.004],[b.x,y+.016,z1+.004],[a.x,y+.016,z0+.004]],'#616c67');poly([[a.x,y-.016,z0],[b.x,y-.016,z1],[b.x,y-.016,z1+.004],[a.x,y-.016,z0+.004]],'#424d49');}
 }
 // End marker painted onto both lanes.
 for(let n=0;n<8;n++){const e=road.at(-1),a=road[road.length-13],y=-.07525+n*.0188125;poly([[a.x,y,a.z+.0005],[e.x,y,e.z+.0005],[e.x,y+.0188125,e.z+.0005],[a.x,y+.0188125,a.z+.0005]],n%2?'#384440':'#e2dfcc');}
 const car=(sp,p,lane,color,alpha)=>{
 const ca=Math.cos(sp.angle),sa=Math.sin(sp.angle),r=p.radius/1000;const point=(x,y,z)=>[sp.x+x*ca-z*sa,lane+y,sp.z+x*sa+z*ca];
 const length=.14,width=.036,bodyTop=.017,bodyBottom=.003;
 const corners=[[-length/2,-width/2,bodyBottom],[length/2,-width/2,bodyBottom],[length/2,width/2,bodyBottom],[-length/2,width/2,bodyBottom],[-length/2,-width/2,bodyTop],[length/2,-width/2,.008],[length/2,width/2,.008],[-length/2,width/2,bodyTop]].map(a=>point(...a));
 for(const face of [[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]])poly(face.map(i=>corners[i]),color,alpha);
 poly([point(-.047,-.009,.0175),point(-.01,-.009,.014),point(-.01,.009,.014),point(-.047,.009,.0175)],'#263734',alpha);
 for(const wx of [-.047,.047])for(const wy of [-.025,.025]){
 const side=wy<0?-1:1,outer=wy+side*.004;const ring=[];for(let j=0;j<14;j++){let a=2*Math.PI*j/14;ring.push(point(wx+r*Math.cos(a),outer,r*Math.sin(a)));}
 poly(ring,'#1b2223',alpha);const hub=[];for(let j=0;j<12;j++){let a=2*Math.PI*j/12;hub.push(point(wx+r*.27*Math.cos(a),outer+side*.0002,r*.27*Math.sin(a)));}poly(hub,'#a2aeab',alpha);
 const spin=sp.s/r;poly([point(wx+r*.3*Math.cos(spin),outer+side*.0004,r*.3*Math.sin(spin)),point(wx+r*.9*Math.cos(spin),outer+side*.0004,r*.9*Math.sin(spin)),point(wx+r*.9*Math.cos(spin+.09),outer+side*.0004,r*.9*Math.sin(spin+.09))],'#bac6c0',alpha);
 }
 };
 if(ghost)car(ghost.sample,ghost.p,.037625,'#8ebec9',.7);
 car(sample,run.p,-.037625,'#d4ec8e',1);
 polygons.sort((a,b)=>a.depth-b.depth);
 for(const face of polygons){ctx.beginPath();face.ps.forEach((p,i)=>{const a=project(p);i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y);});ctx.closePath();ctx.globalAlpha=face.alpha;ctx.fillStyle=face.color;ctx.fill();}ctx.globalAlpha=1;
 for(const cut of run.track.cuts){const q=global.DerbyPhysics.lookup(run.track.path,cut),a=global.DerbyPhysics.lookup(road,q.rawX,'rawX');line([[a.x,-.07525,a.z+.001],[a.x,.07525,a.z+.001]],'#4c594e',.65);}
 // The current trajectory appears only above the track, making jumps legible.
 const flight=run.samples.filter(s=>!s.ground&&s.t<=sample.t);let segment=[];for(const s of flight){if(segment.length&&s.t-segment.at(-1).t>.015){if(segment.length>1)line(segment.map(q=>[q.x,-.037625,q.z]),'#e1ab7b',1,[3,4]);segment=[];}segment.push(s);}if(segment.length>1)line(segment.map(q=>[q.x,-.037625,q.z]),'#e1ab7b',1,[3,4]);
 const label=(text,point,align)=>{const a=project(point);ctx.font='10px system-ui';ctx.fillStyle='#b6c5bd';ctx.textAlign=align;ctx.fillText(text,a.x,a.y);};
 label('START',[road[0].x,-.1,road[0].z+.03],'left');label('FINISH',[road.at(-1).x,-.1,road.at(-1).z+.04],'right');
 }
}
global.DerbyRenderer=DerbyRenderer;
})(window);
