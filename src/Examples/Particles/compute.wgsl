struct Particle {
  pos: vec2f,
  vel: vec2f,
  // col: vec3f
};

struct Options {
  screen_size: vec2f,
  diffuse_rate: f32,
  decay_rate: f32
}


@group(0) @binding(0) var<uniform> options: Options;
@group(0) @binding(1) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(2) var<storage, read_write> particlesOut: array<Particle>;
@group(0) @binding(3) var<storage, read_write> screenArray: array<array<vec4<f32>, 128>, 128>;
@group(0) @binding(4) var srcTexture : texture_2d<f32>;
@group(0) @binding(5) var dstTexture : texture_storage_2d<rgba8unorm, write>;

fn at(x: i32, y: i32) -> vec4<f32> {
  return textureLoad(srcTexture, vec2<i32>(x, y), 0);
}

fn at2(x: i32, y: i32) -> vec4<f32> {
  return textureLoad(srcTexture, vec2<i32>(x, y), 0);
}

@compute @workgroup_size(14,1)
fn Simulate(@builtin(global_invocation_id) global_id: vec3u) {
  dbg_init(u32(global_id.x));
  let pid = i32(global_id.x);
  let p = particlesIn[pid];

  let newPos = p.pos + (p.vel * 0.1);
  var newVel = p.vel;
  if (newPos.x < 0 || newPos.x > 127 ) {
    newVel.x = -1 * newVel.x;
  }
  if (newPos.y < 0 || newPos.y > 127 ) {
    newVel.y = -1 * newVel.y;
  }

  particlesOut[pid].pos = p.pos + (newVel * 0.1);
  particlesOut[pid].vel = newVel;

  dbg_f32m(0, particlesOut[pid].pos.x);
  dbg_f32m(1, particlesOut[pid].pos.y);

  let c = vec4f(0.8, 0.5, 0.2, 1.0);
  // textureStore(dstTexture, vec2<i32>(i32(p.pos.x), i32(p.pos.y)), c);

  screenArray[i32(p.pos.x)][i32(p.pos.y)] = c;
}

@compute @workgroup_size(16, 16)
fn Diffuse(@builtin(global_invocation_id) id : vec3<u32>)
{
	var sum = vec4<f32>(0.);
	// let originalCol = (i32(id.x), i32(id.y));
  let originalCol = screenArray[id.x][id.y];


	// 3x3 blur
	for (var offsetX = -1; offsetX <= 1; offsetX = offsetX + 1) {
		for (var offsetY = -1; offsetY <= 1; offsetY = offsetY + 1) {
			let sampleX = min(i32(options.screen_size.x) - 1, max(0, i32(id.x) + offsetX));
			let sampleY = min(i32(options.screen_size.y) - 1, max(0, i32(id.y) + offsetY));
			sum = sum + screenArray[sampleX][sampleY];
		}
	}

	var blurredCol = sum / vec4<f32>(9., 9., 9., 9.);
	let diffuseWeight = clamp(5. * options.diffuse_rate * 0.005, 0., 1.);

	blurredCol = originalCol * (1. - diffuseWeight) + blurredCol * diffuseWeight;

  let p = 2. * options.decay_rate * 0.005;
  let pix = max(vec4<f32>(0., 0., 0., 0.), blurredCol - vec4<f32>(p));
  screenArray[id.x][id.y] = pix;
}

@compute @workgroup_size(16, 16)
fn Paint(@builtin(global_invocation_id) id: vec3<u32>) {
    // Viewport resolution (in pixels)
    let screen_size = vec2<u32>(textureDimensions(dstTexture));

    // Prevent overdraw for workgroups on the edge of the viewport
    if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }

    var col = screenArray[id.x][id.y].rgb;

    // Convert from gamma-encoded to linear colour space
    col = pow(col, vec3<f32>(2.2));

    // Output to screen (linear colour space)
    textureStore(dstTexture, vec2<i32>(id.xy), vec4<f32>(col, 1.));
}