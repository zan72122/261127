// 共通 GLSL（ノイズ・ワーリー・バンプ）
export const COMMON = /* glsl */`
vec3 s2l(vec3 c){ return pow(c, vec3(2.2)); }
float h13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
vec3 h33(vec3 p){ p = fract(p*vec3(0.1031,0.1030,0.0973)); p += dot(p, p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
float vn(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x), mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x), mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x), f.y), f.z);
}
float fbm3(vec3 p){ return vn(p)*0.55 + vn(p*2.03+7.1)*0.3 + vn(p*4.01+3.7)*0.15; }
// x=F1 y=F2 z=セルのハッシュ w=未使用 / wc=最寄りセル中心
vec4 worley(vec3 p, out vec3 wc){
  vec3 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0; vec3 cid = i;
  for(int z=-1; z<=1; z++) for(int y=-1; y<=1; y++) for(int x=-1; x<=1; x++){
    vec3 g = vec3(float(x),float(y),float(z));
    vec3 o = h33(i+g)*0.8+0.1;
    vec3 r = g + o - f; float d = dot(r,r);
    if(d < d1){ d2 = d1; d1 = d; cid = i+g; wc = i+g+o; } else if(d < d2){ d2 = d; }
  }
  return vec4(sqrt(d1), sqrt(d2), h13(cid*1.37+0.5), 0.0);
}
vec3 bumpN(vec3 n, float h, vec3 vpos, float fd){
  vec3 dpdx = dFdx(vpos), dpdy = dFdy(vpos);
  float hx = dFdx(h), hy = dFdy(h);
  vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  float det = dot(dpdx, r1) * fd;
  vec3 g = sign(det) * (hx*r1 + hy*r2);
  return normalize(abs(det)*n - g);
}
`;
