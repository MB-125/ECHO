async () => {
  const G=ECHO.Game, In=ECHO.Input, U=ECHO.U; const out={stages:[], counts:{}};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const close=()=>{ for(let k=0;k<8;k++){ const b=[...document.querySelectorAll('#modal button')].find(b=>/own way|Go on|Get up|Not now|Leave it|Keep it/.test(b.textContent)) || document.querySelector('#modal:not(.hidden) button:not([disabled])'); if(b) b.click(); } ECHO.UI.closeModal(); if (ECHO.UI.panelOpen) ECHO.UI.closePanel(); };
  const step=n=>{ for(let k=0;k<n;k++){ G.update(0.05); if (ECHO.UI.modalOpen && k%10===0) close(); } };
  const S=async(name,fn)=>{ window._stage=name; const t0=performance.now(); try { await fn(); out.stages.push(name+' ok '+Math.round(performance.now()-t0)+'ms'); } catch(e){ window._errs.push(name+' :: THROW '+(e&&e.stack||e).toString().slice(0,700)); out.stages.push(name+' THREW'); } close(); };
  close(); step(3);
  const W=G.world;
  const keepAlive=()=>{ if (G.pe.hp < G.pl.maxHp*0.3) { G.pl.hp=G.pe.hp=G.pl.maxHp; } };
  const k0=ECHO.Combat.kill; ECHO.Combat.kill=(t,...a)=>{ if(t===G.pe){ t.hp=t.maxHp; G.pl.hp=t.hp; return; } return k0(t,...a); };
  In.enabled=true;
  const press=(k)=>{ In.pressed.add(k); };
  const keys=['w','a','s','d'];
  const play=(n, opt={})=>{ for(let i=0;i<n;i++){ const ks=new Set(); if(Math.random()<0.9) ks.add(keys[(i/40|0)%4]); if(Math.random()<0.15) ks.add(keys[(Math.random()*4)|0]); if (opt.shift && Math.random()<0.2) ks.add('Shift'); In.down=ks; In.mx=600+Math.cos(i*0.1)*200; In.my=400+Math.sin(i*0.13)*150;
      if(i%13===0) In.mpressed[0]=true; In.mdown[0]=i%60<5; if(i%97===0) In.mpressed[2]=true; In.mdown[2]=i%97<10;
      if(i%71===0) press(' '); if(i%150===0) press('q'); if(i%150===20) In.down.add('q');
      if (opt.extra && i%37===0) press(opt.extra[(i/37|0)%opt.extra.length]);
      G.update(0.05); keepAlive(); if (ECHO.UI.modalOpen && i%10===0) close(); if (ECHO.UI.panelOpen && i%30===0) ECHO.UI.closePanel(); }
    In.down=new Set(); In.mdown=[false,false,false]; };
  G.pl.prowess.lv = Math.max(G.pl.prowess.lv||1, 25); ECHO.PlayerCtl.derivedT=0; G.pl.gold=50000;
  await S('walk-town', async()=>{ play(400, { extra:['1','2','3','5','6','7','8','9','0','h','g','o','l','y'] }); });
  await S('ui-pages', async()=>{
    const tabs=['guide','nearby','story','ambition','tasks','people','animals','tamed','powers','guard','letters','places','realm','wonders','heard','self','pastimes','help'];
    for (const t of tabs){ window._stage='journal:'+t; ECHO.UI.openJournal(t); step(2); ECHO.UI.closePanel(); }
    window._stage='character'; ECHO.UI.openCharacter(); step(2); ECHO.UI.closePanel();
    window._stage='map'; ECHO.UI.openMap(); await wait(300); step(2); ECHO.UI.closePanel();
    window._stage='nav'; if (ECHO.Nav) { ECHO.Nav.openPicker(G); step(2); ECHO.UI.closePanel(); }
    const s=ECHO.World.nearestSettlement(W, G.pe.x, G.pe.y) || W.settlements[0];
    for (const b of s.buildings.slice(0,40)) { window._stage='building:'+b.type; try { ECHO.UI.openBuilding(s,b); } catch(e){ window._errs.push('building:'+b.type+' :: THROW '+e.stack.slice(0,500)); } step(1); close(); }
    window._stage='pause'; if (ECHO.Screens && ECHO.Screens.openPause) { ECHO.Screens.openPause(); step(1); ECHO.Screens.closePause(); }
  });
  await S('tame', async()=>{
    G.pl.tameMode='breath'; G.pl.leash=false; const od=ECHO.Tame.onDeath; out.od=[]; ECHO.Tame.onDeath=(g,e,from)=>{ const r=od(g,e,from); if(out.od.length<6) out.od.push((e.species||'?')+' from:'+(from===g.pe?'pe':from?(from.species||from.type):'null')+' r:'+r+' fin:'+!!e._finish+' boss:'+ECHO.Tame.isBoss(e)+' can:'+ECHO.Tame.can(g,e)+' pack:'+ECHO.Tame.pack(g.pl).length+' hp:'+e.hp); return r; };
    const sp=ECHO.Ent.freeSpot(W, G.pe.x+30, G.pe.y+5, 12)||{x:G.pe.x,y:G.pe.y}; G.pe.x=G.pl.x=sp.x; G.pe.y=G.pl.y=sp.y; step(5);
    const kinds=Object.keys(ECHO.Monsters.DEFS).slice(0,8);
    for (const k of kinds) { window._stage='tame:'+k; const fs=ECHO.Ent.freeSpot(W, G.pe.x+3, G.pe.y, 4)||{x:G.pe.x+3,y:G.pe.y}; const m=ECHO.Monsters.make(G,k,fs.x,fs.y,20); G.addEnt(m); step(1); ECHO.Combat.damage(m, 9e7, {type:'melee', from:G.pe}); step(2); (out.tdbg=out.tdbg||[]).push(k+' dead'+m.dead+' sub'+(m.subdued|0)+' lb'+!!m._lastBreath+' mode'+ECHO.Tame.mode(G.pl)+' can'+ECHO.Tame.can(G,m)+' rdy'+ECHO.Tame.ready(G,m)); if(!m.dead){ ECHO.Tame.begin(G,m); step(2); out.tdbg.push(' chan'+!!ECHO.Tame.chan); step(23); out.tdbg.push(' pack'+G.pl.pack.length);} }
    if (ECHO.Deepwood) for (const k of Object.keys(ECHO.Deepwood.KINDS||{}).slice(0,4)) { window._stage='tame-deep:'+k; try { const m=ECHO.Deepwood.make(G,k,G.pe.x+3,G.pe.y,30,null,1); m.wood=null; G.addEnt(m); step(1); ECHO.Combat.damage(m, 9e7, {type:'melee', from:G.pe}); step(2); if(!m.dead){ ECHO.Tame.begin(G,m); step(25);} } catch(e){ window._errs.push('tame-deep:'+k+' :: THROW '+e.stack.slice(0,400)); } }
    ECHO.Tame.rally(G); step(20); out.counts.pack=G.pl.pack.length;
    ECHO.UI.openJournal('tamed'); await wait(1500); ECHO.UI.closePanel();
  });
  await S('combat', async()=>{
    const kinds=Object.keys(ECHO.Monsters.DEFS);
    let spawned=0; for (let wave=0; wave<4; wave++) {
      for (let i=0;i<6;i++){ const k=kinds[(wave*6+i)%kinds.length]; const fs=ECHO.Ent.freeSpot(W, G.pe.x+5+Math.cos(i)*3, G.pe.y+Math.sin(i)*3, 4); if(!fs) continue; window._stage='combat-spawn:'+k; const f=ECHO.Monsters.make(G,k,fs.x,fs.y,15+wave*5); f.aggro=true; f.target=G.pe; G.addEnt(f); spawned++; }
      window._stage='combat-wave'+wave; play(200, { extra:['z','x','c','1','2','3','4','5','6','7','8','9','0','o'] });
    }
    out.counts.spawned=spawned; out.counts.foesLeft=G.ents.filter(e=>e.foe&&!e.dead&&!e.pal).length;
  });
  await S('relics-potions', async()=>{
    const rng=new ECHO.RNG(7); for (const k of Object.keys(ECHO.Arcana.RELICS)) { const it=ECHO.Arcana.make(W,rng,25,'epic','soak',k); it.holder='player'; G.pl.items.push(it.id); }
    G.pl.potions={}; for (const k of Object.keys(ECHO.Gear.POTIONS)) G.pl.potions[k]=2;
    for (let r=0;r<3;r++){ const ids=G.pl.items.filter(id=>W.items[id]&&W.items[id].kind==='relic'); for (let s=0;s<3;s++) ECHO.Arcana.wear(G.pl, ids[(r*3+s)%ids.length], s); ECHO.Arcana.cd={}; G.pl.mana=G.pl.maxMana; const fs=ECHO.Ent.freeSpot(W, G.pe.x+4, G.pe.y, 4); if(fs){ const f=ECHO.Monsters.make(G,'troll',fs.x,fs.y,20); f.aggro=true; G.addEnt(f); } for (let s=0;s<3;s++){ ECHO.Arcana.use(G, s, 0); step(20); } }
    for (const k of Object.keys(ECHO.Gear.POTIONS)) { ECHO.PlayerCtl.drinkT=0; G.pl.hp=G.pe.hp=G.pl.maxHp*0.4; if (ECHO.Gear.POTIONS[k].rank) ECHO.PlayerCtl.drinkHeal(G); else ECHO.PlayerCtl.drink(G,k); step(4); }
    step(100);
  });
  await S('dungeons', async()=>{
    const X=ECHO.Explore, seen=new Set(), sites=(W.sites||[]).filter(s=>X.DELVES[s.kind] && !seen.has(s.kind) && seen.add(s.kind));
    out.counts.dungeonKinds=sites.map(s=>s.kind).join(',');
    for (const site of sites.slice(0,7)) {
      window._stage='dungeon:'+site.kind; G.pe.x=G.pl.x=site.x; G.pe.y=G.pl.y=site.y+1; step(2);
      ECHO.Quests.enterDelve(G, site, 0); await wait(1800); close(); step(5);
      if (!ECHO.Interior.cur) { window._errs.push('dungeon:'+site.kind+' :: did not enter'); continue; }
      play(250, { extra:['z','x','o','1'] });
      window._stage='dungeon-leave:'+site.kind; ECHO.Interior.leave(G); await wait(1800); close(); step(5);
    }
  });
  await S('interiors', async()=>{
    const s=ECHO.World.nearestSettlement(W, G.pe.x, G.pe.y) || W.settlements[0];
    for (const type of ['inn','house','market','smithy','temple','keep']) { const b=s.buildings.find(b=>b.type===type); if(!b) continue; window._stage='interior:'+type; G.pe.x=G.pl.x=b.x+b.w/2; G.pe.y=G.pl.y=b.y+b.h+0.5; step(2); ECHO.Interior.enter(G, b, s); await wait(1800); close(); if (!ECHO.Interior.cur) continue; play(100); ECHO.Interior.leave(G); await wait(1800); close(); step(3); }
  });
  await S('gate', async()=>{
    const g=W.gates && W.gates.list && W.gates.list[0]; if(!g) return;
    G.pe.x=G.pl.x=g.x; G.pe.y=G.pl.y=g.y+1.5; step(2); try { ECHO.GateWorld.enter(G, g); } catch(e){ window._errs.push('gate :: THROW '+e.stack.slice(0,400)); } await wait(2000); close(); step(5);
    out.counts.gateIn=!!ECHO.Interior.cur;
    if (ECHO.Interior.cur) { play(400, { extra:['z','x','c','o'] }); try { ECHO.Interior.leave(G); } catch(e){} await wait(2000); close(); step(5); }
  });
  await S('fly', async()=>{
    const t=ECHO.Titans.list(W).find(t=>ECHO.Titans.sp(t).flies); if(!t) return; t.bound=true; t.alive=true; t.restUntil=0;
    const sp=ECHO.Ent.freeSpot(W, W.W*0.4, W.H*0.5, 20); G.pe.x=G.pl.x=sp.x; G.pe.y=G.pl.y=sp.y; step(3);
    if (ECHO.Interior.cur) { ECHO.Interior.leave(G); await wait(2000); close(); step(5); } G.pl.beastOut=null; ECHO.Apex.call(G, t.id); step(60); const e=ECHO.Apex.entOf(G, t.id); if(!e) { window._errs.push('fly :: no dragon; interior='+(ECHO.Interior.cur&&ECHO.Interior.cur.type)+' rest='+t.restUntil+' day='+W.day+' alive='+t.alive); return; } e.tamed=true; e.faction='player'; e.x=G.pe.x+1.5; e.y=G.pe.y; e.alt=0; step(2);
    ECHO.Apex.mount(G, e); step(30);
    for (let i=0;i<300;i++){ In.down=new Set([keys[(i/60|0)%4], ...(i%100<40?['Shift']:[]), ...(i%150<20?[' ']:[])]); In.mdown[0]=i%40<10; if(i%50===0) In.mpressed[2]=true; if(i%120===60) press('q'); if(i%200===100) press('f'); G.update(0.05); }
    In.down=new Set(); In.mdown=[false,false,false];
    G.pe.x=G.pl.x=W.W*0.4; G.pe.y=G.pl.y=W.H*0.5; step(10); ECHO.Apex.land(G); for(let i=0;i<200 && G.pl.flying;i++) G.update(0.05); out.counts.landed=!G.pl.flying; step(20);
  });
  await S('time', async()=>{ ECHO.Sim.fastForward(W, 3); step(5); play(600); });
  await S('save-load', async()=>{
    const json=ECHO.Save.serialize(W); out.counts.saveKB=Math.round(json.length/1024);
    const w2=ECHO.Save.deserialize(json); G.start(w2); await wait(500); close(); step(20);
    out.counts.packAfterLoad=G.pl.pack?G.pl.pack.length:0; out.counts.relicsAfterLoad=(G.pl.relics||[]).filter(Boolean).length; out.counts.arc=JSON.stringify(G.pl.arc||{}).slice(0,80);
    play(300, { extra:['o','z','1'] });
  });
  out.counts.ents=G.ents.length; out.counts.errs=window._errs.length;
  return out; }
