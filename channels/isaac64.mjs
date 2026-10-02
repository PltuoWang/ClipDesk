// ISAAC-64, adapted from the MIT implementation by oliver-zch.
// See channels/LICENSE-isaac.txt and THIRD_PARTY_NOTICES.md.
const u = n => BigInt.asUintN(64, n);
function mix(v) {
  let [a,b,c,d,e,f,g,h] = v;
  a=u(a-e); f=u(f^(h>>9n)); h=u(h+a);
  b=u(b-f); g=u(g^(a<<9n)); a=u(a+b);
  c=u(c-g); h=u(h^(b>>23n)); b=u(b+c);
  d=u(d-h); a=u(a^(c<<15n)); c=u(c+d);
  e=u(e-a); b=u(b^(d>>14n)); d=u(d+e);
  f=u(f-b); c=u(c^(e<<20n)); e=u(e+f);
  g=u(g-c); d=u(d^(f>>17n)); f=u(f+g);
  h=u(h-d); e=u(e^(g<<14n)); g=u(g+h);
  return [a,b,c,d,e,f,g,h];
}
export function channelsKeystream(key, length = 131072) {
  if (!/^[0-9]{1,20}$/.test(String(key)) || BigInt(key) > 0xffffffffffffffffn) throw Error('视频解码信息无效，请重新播放视频。');
  const mm = Array(256).fill(0n), seed = Array(256).fill(0n);
  seed[0] = BigInt(key);
  let v = Array(8).fill(0x9e3779b97f4a7c13n), aa=0n, bb=0n, cc=0n, count=255;
  for (let i=0;i<4;i++) v=mix(v);
  for (const source of [seed, mm]) for (let i=0;i<256;i+=8) {
    v=mix(v.map((n,j)=>u(n+source[i+j])));
    for (let j=0;j<8;j++) mm[i+j]=v[j];
  }
  const refill = () => {
    cc=u(cc+1n); bb=u(bb+cc);
    for (let i=0;i<256;i++) {
      const x=mm[i];
      aa=u([()=>~(aa^(aa<<21n)),()=>aa^(aa>>5n),()=>aa^(aa<<12n),()=>aa^(aa>>33n)][i%4]());
      aa=u(aa+mm[(i+128)%256]);
      const y=u(mm[Number((x>>3n)&255n)]+aa+bb); mm[i]=y;
      bb=u(mm[Number((y>>11n)&255n)]+x); seed[i]=bb;
    }
  };
  refill(); const result=Buffer.alloc(length);
  for (let offset=0;offset<length;offset+=8) {
    const word=seed[count]; if (count===0) { refill(); count=255; } else count--;
    for (let j=0;j<8 && offset+j<length;j++) result[offset+j]=Number((word>>BigInt((7-j)*8))&255n);
  }
  return result;
}
