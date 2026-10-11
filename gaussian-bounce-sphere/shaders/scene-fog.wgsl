// Semi-analytic animated volume density and Beer-Lambert extinction.
// Independent from isosurface rendering; evaluated along the same fixed-step ray.
fn fogNoise3d(position:vec3<f32>)->f32{
 let offset=cfg.u9.y*cfg.u11.x;
 let p=position*cfg.u10.w;
 let shifted=vec3<f32>(p.x+.45*sin(p.y*.77+offset*.54),
                        p.y+.34*sin(p.z*.63-offset*.31),
                        p.z+.40*sin(p.x*.51+offset*.38));
 let big=sin(shifted.x+offset*.53)*sin(shifted.y*.81-offset*.22)*sin(shifted.z*.91+offset*.35);
 let detail=sin(shifted.x*1.71-offset*.32)*sin(shifted.z*1.37+shifted.y*.92+offset*.22);
 return clamp(.5+.32*big+.18*detail,0.0,1.0);
}
fn fogAmountAt(point:vec3<f32>,metaballDensity:f32)->f32{
 if(cfg.u10.x<.5){return 0.0;}
 let waviness=mix(1.0,.18+1.64*fogNoise3d(point),cfg.u11.y);
 let altitude=exp(-abs(point.y-cfg.u12.z)*cfg.u12.w);
 let ambientFog=waviness*altitude;
 let particleFog=sqrt(max(0.0,metaballDensity))*cfg.u10.z*(.62+.38*waviness);
 var concentration=ambientFog;
 if(cfg.u10.x>2.5){concentration=.37*ambientFog+.80*particleFog;}
 else if(cfg.u10.x>1.5){concentration=particleFog;}
 return max(0.0,concentration)*cfg.u10.y;
}
fn fogTintColor()->vec3<f32>{
 let phase=cfg.u12.x*6.2831853;
 return vec3<f32>(.37,.54,.68)+.15*cos(vec3<f32>(phase,phase+2.094,phase+4.189));
}
fn fogScatterTerm(lightDirection:vec3<f32>,viewDirection:vec3<f32>)->f32{
 let anisotropy=cfg.u11.w;
 let forward=dot(lightDirection,-viewDirection);
 let hg=(1.0-anisotropy*anisotropy)/
   pow(max(.13,1.0+anisotropy*anisotropy-2.0*anisotropy*forward),1.5);
 return (.45+.18*min(5.0,hg))*cfg.u12.y;
}
