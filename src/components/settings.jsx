import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { PROJ, ALL_TAGS, TAG_NAMES, TAG_DARK, TAG_LIGHT, LIFE_AREAS, LIFE_AREA_NAMES, LIFE_AREA_DARK, LIFE_AREA_LIGHT } from '../data.js';
import { I } from '../utils/icons.jsx';
import {
  slugId, tagColors, lifeAreaPalette, UNASSIGNED_LIFE_AREA,
  syncTaxonomyGlobals, NICE_SWATCH_GROUPS,
  taxonomySwatch, taxonomySchemeSwatches, taxonomyAutoSwatches, taxonomyAutoSwatch,
  hashString, colorBucket, colorDistance,
  rgbToHsl, hexToRgb, hexToRgba, readableInkFor, readableGlowFor,
} from '../utils/colors.js';

function SwatchPicker({ value, onChange, size=24, rich=false }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);
  const updatePos = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const gap = 4;
    const margin = 8;
    const width = 292;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const maxHeight = Math.min(360, Math.max(180, Math.max(spaceBelow, spaceAbove)));
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    let left = r.left;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    left = Math.max(margin, left);
    let top = openUp ? r.top - maxHeight - gap : r.bottom + gap;
    top = Math.max(margin, top);
    setPos({
      left,
      top,
      width,
      maxHeight: Math.max(160, Math.min(maxHeight, window.innerHeight - top - margin)),
    });
  }, []);
  useEffect(() => {
    if (!open) return;
    updatePos();
    const raf = requestAnimationFrame(updatePos);
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open, updatePos]);
  useEffect(()=>{
    if(!open) return;
    const fn = e => {
      if (btnRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);
  const norm = (c) => (c||'').toLowerCase();
  const swatches = NICE_SWATCH_GROUPS.flatMap(g => g.colors.map(([name,color,fg]) => ({name,color,...taxonomySwatch(color,fg)})));
  const popover = open ? ReactDOM.createPortal(
    <div ref={popRef}
      style={{
        position:'fixed',
        top:pos?.top ?? 0,
        left:pos?.left ?? -9999,
        zIndex:1000,
        background:'var(--surface)',
        border:'1px solid var(--border-s)',
        borderRadius:6,
        boxShadow:'var(--shadow-lg)',
        padding:10,
        width:pos?.width ?? 292,
        maxHeight:pos?.maxHeight ?? 360,
        overflowY:'auto',
        visibility:pos?'visible':'hidden'
      }}
      onClick={e=>e.stopPropagation()}
      onMouseDown={e=>e.stopPropagation()}>
      {NICE_SWATCH_GROUPS.map(group=>(
        <div key={group.name} style={{marginBottom:10}}>
          <div style={{fontSize:9.5,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',margin:'0 0 6px'}}>{group.name}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(6, 34px)',gap:6}}>
            {group.colors.map(([name,color,fg])=>{
              const picked = taxonomySwatch(color,fg);
              return (
                <button key={`${group.name}-${name}`} type="button" title={`${name} ${color}`} onClick={()=>{onChange(rich ? picked : color);setOpen(false);}}
                  style={{width:34,height:24,border:norm(value)===norm(color)?'2px solid var(--accent)':'1px solid var(--border-s)',borderRadius:5,background:color,cursor:'pointer',padding:0,boxShadow:'inset 0 0 0 1px rgba(255,255,255,.25)'}}/>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{display:'flex',alignItems:'center',gap:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
        <input type="color" value={swatches.find(s=>norm(s.color)===norm(value)) ? '#737373' : (value || '#737373')} onChange={e=>{onChange(e.target.value);setOpen(false);}}
          style={{width:28,height:24,border:'1px solid var(--border-s)',borderRadius:4,cursor:'pointer',padding:1,background:'var(--surface-2)'}}/>
        <span style={{fontSize:10.5,color:'var(--t4)'}}>Custom color</span>
      </div>
    </div>,
    document.body
  ) : null;
  return (
    <div style={{display:'inline-block'}} onClick={e=>e.stopPropagation()}>
      <button ref={btnRef} type="button" onClick={()=>setOpen(o=>!o)}
        style={{width:size,height:size,border:'1px solid var(--border-s)',borderRadius:3,background:value||'#737373',cursor:'pointer',padding:0,display:'block'}}/>
      {popover}
    </div>
  );
}

function SettingsScrollPane({ children }) {
  const ref = useRef(null);
  const [bar, setBar] = useState({show:false, top:8, height:36});
  const updateBar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const overflow = el.scrollHeight - el.clientHeight;
    if (overflow <= 1) {
      setBar(b => b.show ? {...b, show:false} : b);
      return;
    }
    const pad = 8;
    const track = Math.max(1, el.clientHeight - pad * 2);
    const height = Math.max(36, track * el.clientHeight / el.scrollHeight);
    const top = pad + (track - height) * (el.scrollTop / overflow);
    setBar({show:true, top, height});
  }, []);
  useLayoutEffect(() => {
    updateBar();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateBar);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [children, updateBar]);
  useEffect(() => {
    window.addEventListener('resize', updateBar);
    return () => window.removeEventListener('resize', updateBar);
  }, [updateBar]);
  return (
    <div className="settings-scroll-shell">
      <div ref={ref} className="settings-scroll settings-main-pane" onScroll={updateBar}>
        <div className="settings-main-inner">{children}</div>
      </div>
      {bar.show && (
        <div className="settings-scrollbar">
          <div className="settings-scrollbar-thumb" style={{top:bar.top,height:bar.height}}/>
        </div>
      )}
    </div>
  );
}

function TaxonomyManager({ taxonomy, actions }) {
  const [newContext,setNewContext] = useState('');
  const [newTag,setNewTag] = useState('');
  const [newLifeArea,setNewLifeArea] = useState('');
  const [autoSchemes,setAutoSchemes] = useState({context:'Pastel',tag:'Pastel',lifeArea:'Pastel'});
  const [allAutoScheme,setAllAutoScheme] = useState('Use section schemes');
  const importRef = useRef(null);
  const Row = ({kind,item,index,total}) => {
    const isContext = kind==='context';
    return (
      <div className="tax-row" style={{alignItems:isContext?'flex-start':'center'}}>
        <SwatchPicker rich value={item.color || item.light?.bg || item.light?.fg || '#737373'}
          onChange={picked=>{
            const changes = typeof picked === 'object'
              ? {color:picked.color,dark:picked.dark,light:picked.light}
              : {color:picked,...taxonomySwatch(picked)};
            actions.update(kind,item.id,changes);
          }}/>
        <div style={{flex:1,minWidth:0}}>
          <input className="tax-input" value={item.label}
            onChange={e=>actions.update(kind,item.id,{label:e.target.value})}/>
          {isContext && (
            <select className="tax-input" style={{marginTop:6}}
              value={item.defaultLifeArea || ''}
              onChange={e=>actions.update(kind,item.id,{defaultLifeArea:e.target.value||null})}>
              <option value="">Default Life Area</option>
              {taxonomy.lifeAreas.map(area=><option key={area.id} value={area.id}>{area.label}</option>)}
            </select>
          )}
        </div>
        <button className="tax-btn" disabled={index===0} onClick={()=>actions.move(kind,item.id,-1)}>Up</button>
        <button className="tax-btn" disabled={index===total-1} onClick={()=>actions.move(kind,item.id,1)}>Down</button>
        <button className="tax-btn danger" onClick={()=>actions.remove(kind,item.id)}>Del</button>
      </div>
    );
  };
  const schemeOptions = ['All Schemes', ...NICE_SWATCH_GROUPS.map(g=>g.name)];
  const allSchemeOptions = ['Use section schemes', ...schemeOptions];
  const setSectionScheme = (kind, scheme) => setAutoSchemes(prev => ({...prev,[kind]:scheme}));
  const SectionTools = ({kind, label}) => (
    <>
      <select className="tax-input" value={autoSchemes[kind]} onChange={e=>setSectionScheme(kind,e.target.value)}
        title={`Scheme for ${label.toLowerCase()}`} style={{width:150}}>
        {schemeOptions.map(name=><option key={name} value={name}>{name}</option>)}
      </select>
      <AutoButton kind={kind} label={label}/>
    </>
  );
  const AutoButton = ({kind, label}) => (
    <button className="tb-btn" onClick={()=>actions.autoColor(kind, autoSchemes[kind])} title={`Apply ${autoSchemes[kind]} colors to every ${label.toLowerCase()}`}>
      Auto apply colors
    </button>
  );
  return (
    <>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,padding:'10px 12px',border:'1px solid var(--border-s)',borderRadius:4,background:'var(--surface)'}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:'var(--t1)',marginBottom:2}}>Auto color schemes</div>
          <div style={{fontSize:11.5,color:'var(--t4)',lineHeight:1.35}}>Choose one scheme for Apply everything, or let each subsection use its own scheme.</div>
        </div>
        <select className="tax-input" value={allAutoScheme} onChange={e=>setAllAutoScheme(e.target.value)}
          title="Scheme for Apply everything" style={{width:180}}>
          {allSchemeOptions.map(name=><option key={name} value={name}>{name}</option>)}
        </select>
        <button className="tb-btn primary" onClick={()=>actions.autoColor('all', allAutoScheme === 'Use section schemes' ? autoSchemes : allAutoScheme)}
          title={allAutoScheme === 'Use section schemes' ? 'Apply each subsection selected scheme' : `Apply ${allAutoScheme} to every section`}>
          Apply to everything
        </button>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',flex:1}}>Location</div>
        <SectionTools kind="context" label="Locations"/>
      </div>
      <div className="tax-list">
        {taxonomy.contexts.map((c,i)=><Row key={c.id} kind="context" item={c} index={i} total={taxonomy.contexts.length}/>)}
      </div>
      <div className="tax-add">
        <input className="tax-input" placeholder="New location" value={newContext} onChange={e=>setNewContext(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&newContext.trim()){actions.add('context',newContext);setNewContext('');}}}/>
        <button className="tb-btn primary" onClick={()=>{if(newContext.trim()){actions.add('context',newContext);setNewContext('');}}}>Add</button>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,marginTop:26,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',flex:1}}>Tags</div>
        <SectionTools kind="tag" label="Tags"/>
      </div>
      <div className="tax-list">
        {taxonomy.tags.map((t,i)=><Row key={t.id} kind="tag" item={t} index={i} total={taxonomy.tags.length}/>)}
      </div>
      <div className="tax-add">
        <input className="tax-input" placeholder="New tag" value={newTag} onChange={e=>setNewTag(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&newTag.trim()){actions.add('tag',newTag);setNewTag('');}}}/>
        <button className="tb-btn primary" onClick={()=>{if(newTag.trim()){actions.add('tag',newTag);setNewTag('');}}}>Add</button>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,marginTop:26,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',flex:1}}>Life Areas</div>
        <SectionTools kind="lifeArea" label="Life Areas"/>
      </div>
      <div className="tax-list">
        {taxonomy.lifeAreas.map((area,i)=><Row key={area.id} kind="lifeArea" item={area} index={i} total={taxonomy.lifeAreas.length}/>)}
      </div>
      <div className="tax-add">
        <input className="tax-input" placeholder="New life area" value={newLifeArea} onChange={e=>setNewLifeArea(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&newLifeArea.trim()){actions.add('lifeArea',newLifeArea);setNewLifeArea('');}}}/>
        <button className="tb-btn primary" onClick={()=>{if(newLifeArea.trim()){actions.add('lifeArea',newLifeArea);setNewLifeArea('');}}}>Add</button>
      </div>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
        <button className="tb-btn" onClick={actions.exportTaxonomy}>Export taxonomy</button>
        <input ref={importRef} type="file" accept=".json,application/json" style={{display:'none'}}
          onChange={e=>actions.importTaxonomy(e.target.files?.[0])}/>
        <button className="tb-btn" onClick={()=>importRef.current?.click()}>Import taxonomy</button>
      </div>
    </>
  );
}

const PRESETS_DATA = [
  {n:'Harbor',  a:'#0f766e', db:'#071512',ds:'#10201d',dn:'#06110f',dbr:'#1d342f',dt:'#e6fffb', lb:'#f3f7f4',ls:'#fffdfa',ln:'#e7efe9',lbr:'#d5ded7',lt:'#17211d'},
  {n:'Indigo',  a:'#4f46e5', db:'#0d1020',ds:'#171a2f',dn:'#080b18',dbr:'#252a46',dt:'#eef2ff', lb:'#f4f6ff',ls:'#ffffff',ln:'#e8ecff',lbr:'#d7ddfa',lt:'#17172f'},
  {n:'Ember',   a:'#ea580c', db:'#190f0a',ds:'#261812',dn:'#110a06',dbr:'#3a2419',dt:'#fff1e7', lb:'#fff8f1',ls:'#fffdf9',ln:'#f8eadf',lbr:'#edcfbd',lt:'#24140e'},
  {n:'Moss',    a:'#65a30d', db:'#0d1408',ds:'#182312',dn:'#080f05',dbr:'#29361f',dt:'#f0fbea', lb:'#f6faef',ls:'#fffffb',ln:'#e9f2df',lbr:'#d5e2c5',lt:'#17220f'},
  {n:'Lagoon',  a:'#0284c7', db:'#07141c',ds:'#102331',dn:'#061019',dbr:'#1c3547',dt:'#e8f7ff', lb:'#f2f9fd',ls:'#ffffff',ln:'#e2f0f8',lbr:'#cbe0eb',lt:'#102532'},
  {n:'Marigold',a:'#d97706', db:'#171207',ds:'#241c0e',dn:'#100c04',dbr:'#362a16',dt:'#fff7db', lb:'#fff9ea',ls:'#fffefa',ln:'#f6edcf',lbr:'#e8d7aa',lt:'#241b08'},
  {n:'Rose',    a:'#e11d48', db:'#180b12',ds:'#25131a',dn:'#10070c',dbr:'#3a2028',dt:'#fff1f4', lb:'#fff5f7',ls:'#fffefe',ln:'#f8e2e8',lbr:'#eec6d0',lt:'#2a1118'},
  {n:'Aubergine',a:'#9333ea',db:'#140d1f',ds:'#20172d',dn:'#0d0816',dbr:'#312342',dt:'#f7efff', lb:'#faf7ff',ls:'#ffffff',ln:'#efe7fb',lbr:'#ddcff3',lt:'#20142f'},
  {n:'Clay',    a:'#b45309', db:'#17110d',ds:'#231a14',dn:'#0f0a07',dbr:'#35271d',dt:'#fff4e8', lb:'#faf4ed',ls:'#fffdf9',ln:'#eee3d7',lbr:'#ddcdbd',lt:'#211812'},
  {n:'Graphite',a:'#525252', db:'#0b0b0b',ds:'#181818',dn:'#050505',dbr:'#2a2a2a',dt:'#f5f5f5', lb:'#f7f7f5',ls:'#ffffff',ln:'#eeeeeb',lbr:'#ddddda',lt:'#181818'},
  {n:'Nordic',  a:'#2563eb', db:'#08111f',ds:'#111d2f',dn:'#050c17',dbr:'#21314a',dt:'#eaf2ff', lb:'#f5f7fb',ls:'#ffffff',ln:'#e8edf5',lbr:'#d5dce8',lt:'#111827'},
  {n:'Mono',    a:'#737373', db:'#0a0a0a',ds:'#171717',dn:'#000000',dbr:'#262626',dt:'#fafafa', lb:'#fafafa',ls:'#ffffff',ln:'#f5f5f5',lbr:'#e5e5e5',lt:'#0a0a0a'},
];
function SettingsView({ tweaks, setTweak, taxonomy, taxonomyActions }) {
  const [tab, setTab] = useState('appearance');
  const SRow = ({label,desc,children}) => (
    <div style={{display:'flex',alignItems:'center',gap:16,padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:500,color:'var(--t1)',marginBottom:2}}>{label}</div>
        {desc && <div style={{fontSize:11.5,color:'var(--t4)',lineHeight:1.4}}>{desc}</div>}
      </div>
      <div style={{flexShrink:0,display:'flex',alignItems:'center',gap:8}}>{children}</div>
    </div>
  );
  const Seg = ({id,opts}) => (
    <div style={{display:'flex',background:'var(--surface-3)',borderRadius:3,padding:2,gap:2}}>
      {opts.map(o=><button key={o} onClick={()=>setTweak(id,o)}
        style={{padding:'3px 10px',border:'none',borderRadius:2,cursor:'pointer',font:'12px var(--font)',
          background:tweaks[id]===o?'var(--surface)':'transparent',
          color:tweaks[id]===o?'var(--t1)':'var(--t3)',
          fontWeight:tweaks[id]===o?500:400,
          boxShadow:tweaks[id]===o?'0 1px 3px rgba(0,0,0,.1)':'none'}}>{o}</button>)}
    </div>
  );
  const Tog = ({id}) => (
    <button onClick={()=>setTweak(id,!tweaks[id])} style={{width:36,height:20,borderRadius:99,border:'none',cursor:'pointer',position:'relative',background:tweaks[id]?'var(--accent)':'var(--surface-3)',transition:'background .15s',flexShrink:0}}>
      <span style={{position:'absolute',top:3,left:tweaks[id]?19:3,width:14,height:14,borderRadius:'50%',background:'#fff',transition:'left .15s',boxShadow:'0 1px 3px rgba(0,0,0,.2)',display:'block'}}/>
    </button>
  );
  const Card = ({children}) => <div style={{background:'var(--surface)',border:'1px solid var(--border-s)',borderRadius:4,overflow:'hidden',marginBottom:16}}>{children}</div>;
  const applyPreset = p => setTweak({accentColor:p.a,dark_bg:p.db,dark_surface:p.ds,dark_sidebar:p.dn,dark_border:p.dbr,dark_text:p.dt,light_bg:p.lb,light_surface:p.ls,light_sidebar:p.ln,light_border:p.lbr,light_text:p.lt});
  const tabs = [
    {id:'appearance',label:'Appearance'},
    {id:'colors',label:'Colors'},
    {id:'layout',label:'Layout'},
    {id:'taxonomy',label:'Taxonomy'},
    {id:'data',label:'Data'},
  ];
  const [exportMsg, setExportMsg] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const importInputRef = useRef(null);
  const handleImportFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const dump = parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object' ? parsed.data : null;
        if (!dump) throw new Error('File is missing a top-level "data" object — not a Task Manager export.');
        const keys = Object.keys(dump).filter(k => k.startsWith('tm_'));
        if (!keys.length) throw new Error('No tm_* keys found in the file.');
        const existing = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('tm_')) existing.push(k);
        }
        const msg = `Import ${keys.length} key${keys.length===1?'':'s'} from "${file.name}"?\n\n`
          + `This will OVERWRITE the following keys in localStorage:\n  ${keys.join('\n  ')}\n\n`
          + (existing.length ? `(You currently have ${existing.length} tm_* key${existing.length===1?'':'s'} stored. Keys not in the import will be left alone.)\n\n` : '')
          + `The page will reload after import so the app re-reads from storage.`;
        if (!window.confirm(msg)) { setImportMsg('Import cancelled.'); setTimeout(()=>setImportMsg(''), 4000); return; }
        for (const k of keys) {
          const v = dump[k];
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        }
        window.location.reload();
      } catch (err) {
        setImportMsg(`Import failed: ${err?.message || err}`);
        setTimeout(()=>setImportMsg(''), 6000);
      }
    };
    reader.onerror = () => {
      setImportMsg('Could not read the file.');
      setTimeout(()=>setImportMsg(''), 4000);
    };
    reader.readAsText(file);
  };
  const handleExport = () => {
    try {
      const dump = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('tm_')) continue;
        const raw = localStorage.getItem(key);
        try { dump[key] = JSON.parse(raw); } catch { dump[key] = raw; }
      }
      const payload = {
        exportedAt: new Date().toISOString(),
        schemaVersion: 1,
        source: 'Task Manager (localStorage)',
        data: dump,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `task-manager-export-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
      const n = Object.keys(dump).length;
      setExportMsg(`Exported ${n} key${n===1?'':'s'} from localStorage.`);
    } catch (e) {
      setExportMsg(`Export failed: ${e?.message || e}`);
    }
    setTimeout(()=>setExportMsg(''), 4000);
  };
  return (
    <div style={{flex:1,minHeight:0,height:'100%',display:'flex',overflow:'hidden',background:'var(--bg-side)'}}>
      <div className="settings-scroll" style={{width:180,minWidth:180,minHeight:0,borderRight:'1px solid var(--border)',padding:'12px 8px',display:'flex',flexDirection:'column',gap:2,background:'var(--bg-side)'}}>
        {tabs.map(t=><div key={t.id} onClick={()=>setTab(t.id)}
          style={{padding:'6px 10px',borderRadius:2,fontSize:13,cursor:'pointer',
            background:tab===t.id?'var(--surface-3)':'transparent',
            color:tab===t.id?'var(--t1)':'var(--t3)',fontWeight:tab===t.id?500:400}}>{t.label}</div>)}
      </div>
      <SettingsScrollPane>
          {tab==='appearance' && <>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>Mode</div>
            <Card>
              <SRow label="Color mode" desc="Dark or light interface."><Seg id="theme" opts={['light','dark']}/></SRow>
              <SRow label="Style" desc="Border radius, shadows and surface treatment."><Seg id="look" opts={['minimal','soft','sharp','glass']}/></SRow>
              <SRow label="Font" desc="Interface typeface."><Seg id="font" opts={['geist','serif','mono']}/></SRow>
            </Card>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,marginTop:24,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>Color presets</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(132px,1fr))',gap:8,marginBottom:20}}>
              {PRESETS_DATA.map(p=>(
                <div key={p.n} onClick={()=>applyPreset(p)}
                  style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',border:`1px solid ${tweaks.accentColor===p.a?'var(--accent)':'var(--border-s)'}`,borderRadius:4,background:'var(--surface)',cursor:'pointer',transition:'border-color .1s'}}>
                  <div style={{width:14,height:14,borderRadius:3,background:p.a,flexShrink:0}}/>
                  <span style={{fontSize:12.5,color:'var(--t1)',fontWeight:500}}>{p.n}</span>
                </div>
              ))}
            </div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>Accent</div>
            <Card>
              <SRow label="Accent color" desc="Highlights, today badge, focus rings.">
                <SwatchPicker value={tweaks.accentColor} onChange={c=>setTweak('accentColor',c)} size={26}/>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--t4)'}}>{tweaks.accentColor}</span>
              </SRow>
            </Card>
          </>}
          {tab==='colors' && <>
            {[['Dark mode palette','dark'],['Light mode palette','light']].map(([title,mode])=>(
              <React.Fragment key={mode}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)',marginTop:mode==='light'?24:0}}>{title}</div>
                <Card>
                  <div style={{padding:'14px 16px',display:'flex',gap:20,flexWrap:'wrap'}}>
                    {[['Background',`${mode}_bg`],['Surface',`${mode}_surface`],['Sidebar',`${mode}_sidebar`],['Borders',`${mode}_border`],['Text',`${mode}_text`]].map(([lbl,key])=>(
                      <div key={key} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
                        <SwatchPicker value={tweaks[key]} onChange={c=>setTweak(key,c)} size={32}/>
                        <span style={{fontSize:10.5,color:'var(--t4)',whiteSpace:'nowrap'}}>{lbl}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </React.Fragment>
            ))}
          </>}
          {tab==='layout' && <>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>Board</div>
            <Card>
              <SRow label="Show weekends" desc="Display Saturday and Sunday columns."><Tog id="showWeekend"/></SRow>
              <SRow label="Day window" desc="How many day columns fit on screen, including the pinned Today column. Auto picks by width; 4 is focused, 5 is workweek, 7 is full week."><Seg id="dayWindow" opts={['auto',4,5,7]}/></SRow>
              <SRow label="Location side panel" desc="Show a resizable location filter panel beside the inbox."><Tog id="showProjectPanel"/></SRow>
              <SRow label="Density" desc="Card padding and column spacing."><Seg id="density" opts={['compact','normal','airy']}/></SRow>
              <SRow label="Card radius" desc="Border radius on task cards.">
                <input type="range" min={0} max={16} step={1} value={tweaks.cardRadius}
                  onChange={e=>setTweak('cardRadius',Number(e.target.value))}
                  style={{width:120,accentColor:'var(--accent)'}}/>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--t4)',minWidth:28,textAlign:'right'}}>{tweaks.cardRadius}px</span>
              </SRow>
              <SRow label="Group radius" desc="Border radius on grouped task outlines.">
                <input type="range" min={0} max={18} step={1} value={tweaks.groupRadius}
                  onChange={e=>setTweak('groupRadius',Number(e.target.value))}
                  style={{width:120,accentColor:'var(--accent)'}}/>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--t4)',minWidth:28,textAlign:'right'}}>{tweaks.groupRadius}px</span>
              </SRow>
              <SRow label="Card spacing" desc="Vertical gap between cards in a column.">
                <input type="range" min={0} max={20} step={1} value={tweaks.cardGap ?? 3}
                  onChange={e=>setTweak('cardGap',Number(e.target.value))}
                  style={{width:120,accentColor:'var(--accent)'}}/>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--t4)',minWidth:28,textAlign:'right'}}>{tweaks.cardGap ?? 3}px</span>
              </SRow>
              <SRow label="Shadow" desc="Controls card and drawer shadow strength.">
                <input type="range" min={0} max={1} step={0.05} value={tweaks.shadowIntensity}
                  onChange={e=>setTweak('shadowIntensity',Number(e.target.value))}
                  style={{width:120,accentColor:'var(--accent)'}}/>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--t4)',minWidth:34,textAlign:'right'}}>{Math.round((tweaks.shadowIntensity ?? 0) * 100)}%</span>
              </SRow>
            </Card>
          </>}
          {tab==='taxonomy' && <TaxonomyManager taxonomy={taxonomy} actions={taxonomyActions}/>}
          {tab==='data' && <>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>Export</div>
            <Card>
              <SRow label="Export all data" desc="Download a JSON file with every tm_* key in localStorage (tasks, settings, taxonomy, delegation people, group prefs, recent block reasons). Read-only — your data stays in localStorage.">
                <button onClick={handleExport}
                  style={{padding:'6px 14px',border:'1px solid var(--border-s)',borderRadius:3,background:'var(--accent)',color:'#fff',font:'500 12.5px var(--font)',cursor:'pointer'}}>
                  Export JSON
                </button>
              </SRow>
              {exportMsg && (
                <div style={{padding:'10px 16px',font:'12px var(--mono)',color:'var(--t3)'}}>{exportMsg}</div>
              )}
            </Card>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,marginTop:24,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>Import</div>
            <Card>
              <SRow label="Import from JSON" desc="Restore from a previously exported file. Overwrites matching keys in localStorage and reloads the app. Keys not present in the file are kept as-is. You'll be asked to confirm before anything is written.">
                <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{display:'none'}}/>
                <button onClick={()=>importInputRef.current && importInputRef.current.click()}
                  style={{padding:'6px 14px',border:'1px solid var(--border-s)',borderRadius:3,background:'var(--surface-2)',color:'var(--t1)',font:'500 12.5px var(--font)',cursor:'pointer'}}>
                  Choose file…
                </button>
              </SRow>
              {importMsg && (
                <div style={{padding:'10px 16px',font:'12px var(--mono)',color:'var(--t3)'}}>{importMsg}</div>
              )}
            </Card>
          </>}
      </SettingsScrollPane>
    </div>
  );
}

// ── ListView (non-week views) ────────────────────────────────────────────
function SettingsDrawer({ open, tweaks, setTweak, taxonomy, taxonomyActions, onClose }) {
  return (
    <div className={`drawer settings-drawer${open?' open':''}`}>
      <div className="dr-hdr">
        <div style={{flex:1}}>
          <div style={{font:'600 18px/1.3 var(--font)',color:'var(--t1)'}}>Settings</div>
          <div style={{fontSize:11,color:'var(--t4)',marginTop:3}}>Appearance and board layout</div>
        </div>
        <button className="dr-act-btn dr-close" onClick={onClose}>x</button>
      </div>
      <div style={{flex:1,minHeight:0,display:'flex',overflow:'hidden',background:'var(--bg)'}}>
        {open && <SettingsView tweaks={tweaks} setTweak={setTweak} taxonomy={taxonomy} taxonomyActions={taxonomyActions}/>}
      </div>
    </div>
  );
}


export { SwatchPicker, SettingsScrollPane, TaxonomyManager, PRESETS_DATA, SettingsView, SettingsDrawer };
