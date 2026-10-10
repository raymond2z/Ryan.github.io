// Live Student Lab stirring on GPU. Only the affected local cells are changed.
// Keeps existing regularized D2Q9 collision/streaming shader untouched.
struct Push {
  width: u32,
  height: u32,
  count: u32,
  pad: u32,
  x: f32,
  y: f32,
  dx: f32,
  dy: f32,
}
@group(0) @binding(0) var<storage,read_write> distribution: array<f32>;
@group(0) @binding(1) var<storage,read> solid: array<u32>;
@group(0) @binding(2) var<uniform> push: Push;
const CX: array<f32,9> = array<f32,9>(0.0,1.0,0.0,-1.0,0.0,1.0,-1.0,-1.0,1.0);
const CY: array<f32,9> = array<f32,9>(0.0,0.0,1.0,0.0,-1.0,1.0,1.0,-1.0,-1.0);
const WT: array<f32,9> = array<f32,9>(
  4.0/9.0,1.0/9.0,1.0/9.0,1.0/9.0,1.0/9.0,
  1.0/36.0,1.0/36.0,1.0/36.0,1.0/36.0
);
@compute @workgroup_size(64)
fn stir(@builtin(global_invocation_id) tid:vec3<u32>){
  let i=tid.x;
  if(i>=push.count||solid[i]!=0u){return;}
  let px=f32(i%push.width);
  let py=f32(i/push.width);
  if(px<2.0||py<2.0||px>=f32(push.width-2u)||py>=f32(push.height-2u)){return;}
  let distance=distance(vec2<f32>(px,py),vec2<f32>(push.x,push.y));
  if(distance>=6.0){return;}
  let weight=max(0.0,1.0-distance/6.0);
  var rho=0.0;var ux=0.0;var uy=0.0;
  for(var q:u32=0u;q<9u;q++){
    let value=distribution[q*push.count+i];
    rho+=value;ux+=value*CX[q];uy+=value*CY[q];
  }
  if(!(rho>0.2&&rho<3.0)){return;}
  var u=ux/rho/0.5+clamp(push.dx*0.008,-0.035,0.035)*weight;
  var v=uy/rho/0.5+clamp(push.dy*0.008,-0.035,0.035)*weight;
  let speed=length(vec2<f32>(u,v));
  if(speed>0.5){u=u*0.5/speed;v=v*0.5/speed;}
  u=u*0.5;v=v*0.5;
  let u2=u*u+v*v;
  for(var q:u32=0u;q<9u;q++){
    let cu=CX[q]*u+CY[q]*v;
    distribution[q*push.count+i]=WT[q]*rho*(1.0+3.0*cu+4.5*cu*cu-1.5*u2);
  }
}
