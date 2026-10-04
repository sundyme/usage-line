// Liquid glass, v5. One plane holds up to eight rounded shapes that melt into each other
// (a smooth union of their distance fields), so a button can grow into a menu, a bubble can
// merge into a lens and a capsule can pinch in two.
//
// The look is the reference's: a thin, light body over a graphite world. The world behind is
// frosted and a little more vivid. Only a narrow lip at the rim bends it, and splits it into
// colour where it bends. A hairline catches the light from the top left and, more faintly, from
// the bottom right, and runs through a soft spectrum along the way. A wide, quiet shadow
// falls outside the glass and never inside it. Everything is computed in the plane's own pixels and
// mapped to the screen through the derivatives, so the glass holds up in perspective.
import * as THREE from 'three'
import { H, W } from './engine.js'
import { UNIT } from './kit.js'
import { GLASS, backRT, halfB, quarterB } from './glass.js'

const MAXS = 8

export function liquid({
  w = 800, h = 400, // the plane, px
  k = 0, // melt radius, px
  tint = '#2c3038', tintA = 0.3, // body colour and how much of it
  lift = 0.045, sat = 1.3, // the vibrancy of what shows through
  frost = 0.62, // 0 clear · .5 half-res blur · 1 quarter-res blur
  refr = 34, bevel = 22, disp = 0.55, // the lip: how far it bends, how wide it is, how much it splits
  rim = 1, prism = 0.4, // the hairline
  shadow = 0.55, spread = 42, dy = 22, // the shadow
  opacity = 1,
} = {}) {
  const shapes = Array.from({ length: MAXS }, () => new THREE.Vector4(0, 0, 0, 0))
  const radii = new Array(MAXS).fill(0)
  const groups = new Array(MAXS).fill(0)
  const u = {
    tBack: { value: backRT.texture },
    tHalf: { value: halfB.texture },
    tQuarter: { value: quarterB.texture },
    res: { value: new THREE.Vector2(W, H) },
    shapes: { value: shapes },
    radii: { value: radii },
    groups: { value: groups },
    count: { value: 0 },
    k: { value: k },
    tint: { value: new THREE.Color(tint) },
    tintA: { value: tintA },
    lift: { value: lift },
    sat: { value: sat },
    frost: { value: frost },
    refr: { value: refr },
    bevel: { value: bevel },
    disp: { value: disp },
    rimK: { value: rim },
    prism: { value: prism },
    shadowK: { value: shadow },
    spread: { value: spread },
    dy: { value: dy },
    opacity: { value: opacity },
    glow: { value: new THREE.Color(0) },
    phase: { value: 0 },
    ph: { value: h / 2 },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy * ${UNIT.toFixed(1)}; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tBack, tHalf, tQuarter; uniform vec2 res;
      uniform vec4 shapes[${MAXS}]; uniform float radii[${MAXS}]; uniform float groups[${MAXS}]; uniform int count;
      uniform float k, tintA, lift, sat, frost, refr, bevel, disp, rimK, prism, shadowK, spread, dy, opacity, phase;
      uniform vec3 tint, glow; uniform float ph; varying vec2 vP;
      float sdr(vec2 p, vec2 b, float r){ r = min(r, min(b.x, b.y)); vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.) + length(max(q, 0.)) - r; }
      float smin(float a, float b, float kk){ if (kk <= 0.) return min(a, b); float h = max(kk - abs(a - b), 0.) / kk; return min(a, b) - h * h * kk * .25; }
      float field(vec2 p){
        float d0 = 1e5, d1 = 1e5;
        for (int i = 0; i < ${MAXS}; i++){
          if (i >= count) break;
          vec4 s = shapes[i];
          if (s.z <= .5 || s.w <= .5) continue;
          float di = sdr(p - s.xy, s.zw, radii[i]);
          if (groups[i] > .5) d1 = smin(d1, di, k); else d0 = smin(d0, di, k);
        }
        return min(d0, d1);
      }
      vec3 world(vec2 uv, float f){
        uv = clamp(uv, vec2(.001), vec2(.999));
        vec3 s = texture2D(tBack, uv).rgb, a = texture2D(tHalf, uv).rgb, b = texture2D(tQuarter, uv).rgb;
        return f < .5 ? mix(s, a, f * 2.) : mix(a, b, f * 2. - 1.);
      }
      void main(){
        vec2 p = vP;
        // local px per screen px, and the map from a local displacement to a screen one
        vec2 jx = dFdx(p), jy = dFdy(p);
        float det = jx.x * jy.y - jy.x * jx.y;
        float pxs = max(1e-3, sqrt(abs(det)));
        float d = field(p);
        float ds = field(p - vec2(0., -dy));
        float dc = field(p - vec2(0., -dy * .2));
        // the shadow, outside only
        float sh = 0.;
        if (shadowK > 0.) {
          float a1 = max(ds, 0.) / spread, a2 = max(dc, 0.) / (spread * .22);
          sh = shadowK * (exp(-a1 * a1 * 1.6) * .75 + exp(-a2 * a2) * .35);
        }
        float aa = clamp(.5 - d / pxs, 0., 1.);
        if (aa <= 0.) {
          if (sh * opacity < .002) discard;
          gl_FragColor = vec4(0., 0., 0., sh * opacity);
          return;
        }
        float e = .6;
        vec2 g = vec2(field(p + vec2(e, 0.)) - field(p - vec2(e, 0.)), field(p + vec2(0., e)) - field(p - vec2(0., e)));
        g = g / max(length(g), 1e-4);
        // the lip: a quarter-round, flat inside
        float T = bevel;
        float s = clamp(-d / T, 0., 1.);
        float kk = 1. - s;
        float curve = 1. - sqrt(max(0., 1. - kk * kk));   // 0 inside, 1 at the rim
        vec2 offL = g * refr * curve;                     // look outward through the lip
        // to screen px: solve J * offS = offL
        vec2 offS = vec2(jy.y * offL.x - jy.x * offL.y, -jx.y * offL.x + jx.x * offL.y) / det;
        vec2 su = gl_FragCoord.xy / res;
        float fr = frost * (1. - .35 * curve);
        vec2 o = offS / res;
        vec3 c;
        c.r = world(su + o * (1. + disp), fr).r;
        c.g = world(su + o, fr).g;
        c.b = world(su + o * (1. - disp), fr).b;
        // vibrancy, a little light, then the body
        float l = dot(c, vec3(.2126, .7152, .0722));
        c = max(mix(vec3(l), c, sat), 0.) * (1. + lift * 2.) + lift * .25;
        c = mix(c, tint, tintA);
        // light from the top left, a fainter kick from the bottom right
        vec2 L = normalize(vec2(-.62, .78));
        float key = max(dot(g, L), 0.), kick = max(dot(g, -L), 0.);
        c += curve * curve * (.10 * key - .05 * kick) * rimK;
        float ang = atan(g.y, g.x) / 6.2831853;
        vec3 spec = .5 + .5 * cos(6.2831853 * (ang * 2. + phase + vec3(0., .33, .67)));
        vec3 rc = mix(vec3(1.), spec, prism);
        float dS = d / pxs;                               // distance in screen px
        float hq = (dS + .9) / .85, iq = (dS + 3.2) / 1.6;
        float hair = exp(-hq * hq);
        float inner = exp(-iq * iq);
        float lum = .22 + 1.5 * key * key * sqrt(key) + .7 * kick * kick * kick;
        c += rc * hair * lum * .75 * rimK;
        c += vec3(1.) * inner * (.04 + .08 * key * key) * rimK;
        // the faintest sheen down the face
        c += vec3(.028) * smoothstep(-ph, ph, p.y) * rimK;
        c += glow * (.6 + .4 * s);
        if (any(isnan(c)) || any(isinf(c))) c = vec3(0.);
        float a = aa * opacity;
        // where the body thins to the edge, the shadow shows through it
        gl_FragColor = vec4(c * a, a + sh * opacity * (1. - aa));
        gl_FragColor.rgb /= max(gl_FragColor.a, 1e-4);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w / UNIT, h / UNIT), mat)
  mesh.layers.set(GLASS)
  mesh.renderOrder = 50
  mesh.frustumCulled = false
  mesh.userData.u = u
  // shapes: [{ x, y, w, h, r }] in plane px, origin at the centre, y up; w/h full sizes
  mesh.userData.set = list => {
    const n = Math.min(MAXS, list.length)
    for (let i = 0; i < MAXS; i++) {
      const sh = list[i]
      if (i < n && sh) {
        shapes[i].set(sh.x ?? 0, sh.y ?? 0, Math.max(0, sh.w / 2), Math.max(0, sh.h / 2))
        radii[i] = sh.r ?? Math.min(sh.w, sh.h) / 2
        groups[i] = sh.g ?? 0
      } else shapes[i].set(0, 0, 0, 0)
    }
    u.count.value = n
  }
  return mesh
}

// screen-px layout helpers: a capsule, a circle, a card
export const capsule = (x, y, w, h) => ({ x, y, w, h, r: h / 2 })
export const disc = (x, y, d) => ({ x, y, w: d, h: d, r: d / 2 })
export const card = (x, y, w, h, r) => ({ x, y, w, h, r })
