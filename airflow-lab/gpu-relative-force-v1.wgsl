// Stage 3.1: relative model force via boundary momentum exchange.
// This uses the post-collision populations from the SAME half-step as Rust.
// No atomics and no interpretation as newtons. Positive y is downward on Canvas.
struct ForceConfig {
  width: u32,
  height: u32,
  count: u32,
  groups: u32,
}
@group(0) @binding(0) var<storage,read> post: array<f32>;
@group(0) @binding(1) var<storage,read> obstacle: array<u32>;
@group(0) @binding(2) var<storage,read_write> partial: array<vec2<f32>>;
@group(0) @binding(3) var<uniform> settings: ForceConfig;
@group(0) @binding(4) var<storage,read_write> smoothedForce: array<vec2<f32>>;
var<workgroup> tile: array<vec2<f32>,64>;
var<workgroup> reduction: array<vec2<f32>,256>;
const CX: array<i32,9> = array<i32,9>(0,1,0,-1,0,1,-1,-1,1);
const CY: array<i32,9> = array<i32,9>(0,0,1,0,-1,1,1,-1,-1);

@compute @workgroup_size(64)
fn boundaryImpulse(
  @builtin(global_invocation_id) gid:vec3<u32>,
  @builtin(local_invocation_index) lane:u32,
  @builtin(workgroup_id) group:vec3<u32>
) {
  let i=gid.x;
  var impulse=vec2<f32>(0.0,0.0);
  if(i<settings.count && obstacle[i]==0u){
    let x=i32(i%settings.width);
    let y=i32(i/settings.width);
    for(var q:u32=1u;q<9u;q++){
      let nx=x+CX[q];
      let ny=y+CY[q];
      if(nx<0||ny<0||nx>=i32(settings.width)||ny>=i32(settings.height)){continue;}
      let neighbor=u32(nx)+u32(ny)*settings.width;
      if(obstacle[neighbor]!=0u){
        let population=post[q*settings.count+i];
        impulse+=2.0*population*vec2<f32>(f32(CX[q]),f32(CY[q]));
      }
    }
  }
  tile[lane]=impulse;
  workgroupBarrier();
  var stride:u32=32u;
  loop {
    if(stride==0u){break;}
    if(lane<stride){tile[lane]+=tile[lane+stride];}
    workgroupBarrier();
    stride=stride/2u;
  }
  if(lane==0u){partial[group.x]=tile[0];}
}

@compute @workgroup_size(256)
fn smoothImpulse(@builtin(local_invocation_index) lane:u32){
  var subtotal=vec2<f32>(0.0,0.0);
  for(var i=lane;i<settings.groups;i+=256u){subtotal+=partial[i];}
  reduction[lane]=subtotal;
  workgroupBarrier();
  var stride:u32=128u;
  loop {
    if(stride==0u){break;}
    if(lane<stride){reduction[lane]+=reduction[lane+stride];}
    workgroupBarrier();
    stride=stride/2u;
  }
  if(lane==0u){
    // Existing Rust/JS: dt=0.5, scale=1/dt², s=1-0.98^dt.
    let smoothing=1.0-sqrt(0.98);
    smoothedForce[0]=(1.0-smoothing)*smoothedForce[0]+
      smoothing*4.0*reduction[0];
  }
}
