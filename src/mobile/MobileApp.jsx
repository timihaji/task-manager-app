import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import './mobile.css';
import { AppContext, ThemeContext, hexToRgba, haptic } from './contexts.js';
import { DataProvider } from './MobileData.jsx';
import {
  TodayScreen, InboxScreen, StackScreen, MoreScreen, ListScreen, SearchScreen,
} from './MobileScreens.jsx';
import {
  TaskDetailSheet, SettingsScreen,
} from './MobileDetails.jsx';
import { QuickAddBar } from './MobileQuickAdd.jsx';
import { ACCENT_OPTS, LOOK_OPTS } from './constants.js';
import { D, TODAY } from './dateUtil.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useWorkspace } from '../lib/WorkspaceProvider.jsx';
import { saveSettings, fetchSettings } from '../lib/db.js';

const SETTINGS_KEY = 'tm_settings';

function readSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); }
  catch { return {}; }
}

function writeSettings(patch) {
  const cur = readSettings();
  const next = { ...cur, ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
  return next;
}

// ── BottomNav ─────────────────────────────────────────────────────────────────
function BottomNav({ activeTab, onNavigate, onQuickAdd, hidden }) {
  const tabs = [
    { id:'today', label:'Today',  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { id:'inbox', label:'Inbox',  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg> },
    { id:'fab',   label:'',       icon: null },
    { id:'stack', label:'Stack',  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><rect x="4" y="4" width="16" height="3" rx="1"/><rect x="4" y="10" width="16" height="3" rx="1"/><rect x="4" y="16" width="11" height="3" rx="1"/></svg> },
    { id:'more',  label:'More',   icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></svg> },
  ];

  const pillLeft = { today:10, inbox:30, stack:70, more:90 }[activeTab];

  return (
    <div style={{
      flexShrink:0, background:'var(--surface)', borderTop:'1px solid var(--border)',
      paddingBottom:'env(safe-area-inset-bottom)', zIndex:100, boxShadow:'0 -1px 0 var(--border)',
      transform: hidden ? 'translateY(110%)' : 'translateY(0)',
      transition:'transform .26s var(--ease-out)',
      pointerEvents: hidden ? 'none' : 'auto',
    }}>
      <div style={{ display:'flex', alignItems:'center', height:58, position:'relative' }}>
        {pillLeft != null && (
          <div style={{ position:'absolute', top:6, left:`${pillLeft}%`, transform:'translateX(-50%)', width:'13%', height:3, borderRadius:99, background:'var(--accent)', transition:'left .42s var(--ease-spring)', pointerEvents:'none' }}/>
        )}
        {tabs.map(tab => {
          if (tab.id === 'fab') {
            return (
              <div key="fab" style={{ flex:1, display:'flex', justifyContent:'center', alignItems:'center' }}>
                <button onClick={onQuickAdd} aria-label="Add task"
                  style={{ width:52, height:52, borderRadius:18, border:'none', background:'var(--accent)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 6px 20px var(--accent-dim), 0 2px 6px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.18)', transition:'transform .12s, box-shadow .15s' }}
                  onTouchStart={e => { const b=e.currentTarget; b.style.transition='transform .08s'; b.style.transform='scale(0.88)'; haptic([7]); }}
                  onTouchEnd  ={e => { const b=e.currentTarget; b.style.transition='transform .45s cubic-bezier(.34,1.56,.64,1)'; b.style.transform='scale(1)'; }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>
            );
          }
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => onNavigate(tab.id)}
              style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, border:'none', background:'transparent', cursor:'pointer', color: isActive ? 'var(--accent)' : 'var(--t3)', padding:'8px 0 6px', transition:'color .2s' }}
              onTouchStart={e => { e.currentTarget.style.transform='scale(0.88)'; e.currentTarget.style.transition='transform .08s'; }}
              onTouchEnd  ={e => { e.currentTarget.style.transition='transform .4s cubic-bezier(.34,1.56,.64,1)'; e.currentTarget.style.transform=''; }}>
              <span style={{ transition:'transform .32s var(--ease-spring)', transform: isActive ? 'translateY(-1px) scale(1.12)' : 'scale(1)' }}>{tab.icon}</span>
              <span style={{ fontSize:10, fontWeight: isActive ? 700 : 500, letterSpacing:'.02em' }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVis(true)); }, []);
  return (
    <div style={{
      position:'fixed', bottom:80, left:'50%', transform:`translateX(-50%) translateY(${vis?0:16}px) scale(${vis?1:.96})`,
      background:'var(--t1)', color:'var(--bg)', padding:'10px 18px', borderRadius:99,
      fontSize:13.5, fontWeight:600, zIndex:600, pointerEvents:'none', whiteSpace:'nowrap',
      boxShadow:'0 8px 28px rgba(0,0,0,.32), 0 2px 6px rgba(0,0,0,.18)', opacity: vis ? 1 : 0,
      transition:'all .3s var(--ease-spring)', letterSpacing:'-.005em',
    }}>
      {message}
    </div>
  );
}

// ── ScreenRouter ──────────────────────────────────────────────────────────────
function ScreenRouter({ screen, pushAnim, onSettingsBack }) {
  const { screen: name, props } = screen;
  const el = useMemo(() => {
    switch (name) {
      case 'today':       return <TodayScreen/>;
      case 'inbox':       return <InboxScreen/>;
      case 'stack':       return <StackScreen/>;
      case 'more':        return <MoreScreen/>;
      case 'settings':    return <SettingsScreen onBack={onSettingsBack}/>;
      case 'project':     return <ListScreen type="project" {...props}/>;
      case 'tag':         return <ListScreen type="tag"     {...props}/>;
      case 'upcoming':
      case 'backlog':
      case 'snoozed':
      case 'someday':
      case 'blocked':
      case 'completed':
      case 'archived':
      case 'delegations':
      case 'routines':
        return <ListScreen type={name} {...props}/>;
      default: return <MoreScreen/>;
    }
  }, [name, JSON.stringify(props), onSettingsBack]);

  return (
    <div key={`${name}-${JSON.stringify(props)}`} style={{
      position:'absolute', inset:0, background:'var(--bg)', overflowX:'hidden',
      animation: pushAnim ? 'mob-screenSlideIn .32s var(--ease-out) forwards' : 'none',
    }}>
      {el}
    </div>
  );
}

// ── AppProvider ───────────────────────────────────────────────────────────────
function AppProvider({ children }) {
  const { user, supabaseDisabled } = useAuth();
  const userId = user?.id ?? null;

  // Settings (theme/accent/look) seeded from the shared tm_settings blob so
  // they roundtrip with desktop where the keys overlap.
  const initial = readSettings();
  const [theme,  setThemeState]  = useState(initial.theme  || 'light');
  const [accent, setAccentState] = useState(initial.accent || ACCENT_OPTS[0]);
  const [look,   setLookState]   = useState(initial.mobileLook || 'soft');

  // Pull cloud settings once we have a user (mirrors desktop bootstrap).
  useEffect(() => {
    if (supabaseDisabled || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const cloud = await fetchSettings(userId);
        if (!cloud || cancelled) return;
        if (cloud.theme)      setThemeState(cloud.theme);
        if (cloud.accent)     setAccentState(cloud.accent);
        if (cloud.mobileLook) setLookState(cloud.mobileLook);
        // Merge into local shadow so it's there for next mount.
        writeSettings(cloud);
      } catch (err) { console.warn('[mobile] fetchSettings failed', err); }
    })();
    return () => { cancelled = true; };
  }, [supabaseDisabled, userId]);

  const persistSetting = useCallback((patch) => {
    const next = writeSettings(patch);
    if (!supabaseDisabled && userId) {
      saveSettings(userId, next).catch(err => console.warn('[mobile] saveSettings failed', err));
    }
  }, [supabaseDisabled, userId]);

  const setTheme  = (v) => { setThemeState(v);  persistSetting({ theme:v  }); };
  const setAccent = (v) => { setAccentState(v); persistSetting({ accent:v }); };
  const setLook   = (v) => { setLookState(v);   persistSetting({ mobileLook:v }); };

  // Reflect to DOM
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    document.body.setAttribute('data-look',  look);
    document.documentElement.style.setProperty('--accent',        accent);
    document.documentElement.style.setProperty('--accent-dim',    hexToRgba(accent, 0.14));
    document.documentElement.style.setProperty('--accent-border', hexToRgba(accent, 0.30));
  }, [theme, accent, look]);

  // ── Navigation + history-based back gestures ────────────────────────────
  // We push a history entry for every open overlay / nested screen, and call
  // history.back() on UI close. The popstate handler is the single source of
  // truth for closing: it runs whether the user hit the OS back button, the
  // X button, or made an edge-swipe-back gesture (which calls history.back()
  // internally). Skips its own programmatic back() to avoid double-firing.
  const [activeTab,  setActiveTab]  = useState('today');
  const [pushAnim,   setPushAnim]   = useState(false);
  const [tabStacks,  setTabStacks]  = useState({
    today: [{ screen:'today', props:{} }],
    inbox: [{ screen:'inbox', props:{} }],
    stack: [{ screen:'stack', props:{} }],
    more:  [{ screen:'more',  props:{} }],
  });
  const currentStack = tabStacks[activeTab];
  const currentScreen = currentStack[currentStack.length - 1];
  const isNested = currentStack.length > 1;

  // Overlay state
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [quickAddOpts, setQuickAddOpts] = useState(null);
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [toast,        setToast]        = useState(null);
  const toastTimer = useRef(null);

  // History layer tracking. Each entry we push corresponds to one closable
  // layer. depth tracks how many we've pushed — popstate decrements.
  const depthRef = useRef(0);

  const pushHistoryLayer = useCallback((kind) => {
    depthRef.current += 1;
    try { window.history.pushState({ mobile: true, kind, depth: depthRef.current }, ''); } catch {}
  }, []);

  // Replace state with our "anchor" on first mount so the first popstate
  // doesn't navigate the user out of the page accidentally.
  useEffect(() => {
    try {
      if (!window.history.state || window.history.state.mobile !== 'anchor') {
        window.history.replaceState({ mobile: 'anchor' }, '');
      }
    } catch {}
  }, []);

  // Ref the QuickAddBar registers on mount so we can focus its input
  // synchronously inside the FAB's click handler (iOS keyboard policy).
  const quickAddBarRef = useRef(null);

  // Per-screen defaults the BottomNav FAB should pick up. Screens with a
  // local-state context (e.g. TodayScreen's selDay) register into this ref
  // on mount/update; the FAB reads it on open. Explicit caller opts override.
  const fabDefaultsRef = useRef({});

  // Screen-derived defaults — driven by the current route, not by any screen's
  // internal state. fabDefaultsRef (set by individual screens) overrides this.
  const deriveScreenDefaults = useCallback(() => {
    const name = currentScreen?.screen;
    const props = currentScreen?.props || {};
    if (name === 'inbox' || name === 'backlog')  return { date: null };
    if (name === 'someday')     return { someday: true };
    if (name === 'project')     return { project: props.projectId, date: TODAY };
    if (name === 'tag')         return { tags: [props.tagId], date: TODAY };
    if (name === 'upcoming')    return { date: D.str(D.add(D.today(), 1)) };
    if (name === 'blocked')     return { date: TODAY, blocked: true };
    if (name === 'snoozed')     return { snoozedUntil: D.str(D.add(D.today(), 1)) };
    if (name === 'completed' || name === 'archived') return {};
    if (name === 'today')       return { date: TODAY };
    if (name === 'stack')       return { date: TODAY };
    return {};
  }, [currentScreen]);

  // ── Open* helpers (always push a history entry first) ───────────────────
  const openDetail = (id) => { pushHistoryLayer('detail'); setActiveTaskId(id); };
  const openQuickAdd = (callerOpts) => {
    // iOS Safari opens the on-screen keyboard only when .focus() runs inside
    // the user-gesture tick. We focus *before* setting state so the focus
    // call is still part of the original click handler's synchronous frame.
    try { quickAddBarRef.current?.focus(); } catch {}
    // Layered defaults: screen-derived → screen-registered overrides → caller.
    const merged = {
      ...deriveScreenDefaults(),
      ...(fabDefaultsRef.current || {}),
      ...(callerOpts || {}),
    };
    pushHistoryLayer('quickadd');
    setQuickAddOpts(merged);
  };
  const openSearch = () => { pushHistoryLayer('search'); setSearchOpen(true); };
  const push = (screen, props = {}) => {
    pushHistoryLayer('screen');
    setTabStacks(prev => ({ ...prev, [activeTab]: [...prev[activeTab], { screen, props }] }));
    setPushAnim(true);
    setTimeout(() => setPushAnim(false), 320);
  };

  // ── Close* helpers route through history.back() so popstate is the
  // single state-mutation path. Avoids divergence between OS-back and UI-X.
  const goBack = useCallback(() => {
    if (depthRef.current > 0) { try { window.history.back(); } catch {} }
  }, []);
  const closeDetail   = goBack;
  const closeQuickAdd = goBack;
  const closeSearch   = goBack;
  const pop           = goBack;

  // setSearchOpen kept on the value (some screens want to programmatically
  // open). Use openSearch for proper history wiring.
  const setSearchOpenWrapper = (v) => { if (v) openSearch(); else goBack(); };

  // Tab switch resets pushAnim but doesn't touch history (tabs are siblings).
  const navigate = (tab) => { setActiveTab(tab); setPushAnim(false); };

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };

  const value = useMemo(() => ({
    theme, setTheme, accent, setAccent, look, setLook,
    activeTab, navigate, push, pop, isNested, currentScreen, pushAnim,
    openDetail, closeDetail, activeTaskId,
    openQuickAdd, closeQuickAdd, quickAddOpts,
    searchOpen, setSearchOpen: setSearchOpenWrapper, openSearch, closeSearch,
    toast, showToast,
    quickAddBarRef,
    fabDefaultsRef,
    // Internal — for MobileShell's popstate handler
    _depthRef: depthRef,
    _setActiveTaskId: setActiveTaskId,
    _setQuickAddOpts: setQuickAddOpts,
    _setSearchOpen: setSearchOpen,
    _popStack: () => setTabStacks(prev => {
      const stack = prev[activeTab];
      if (stack.length <= 1) return prev;
      return { ...prev, [activeTab]: stack.slice(0, -1) };
    }),
  }), [theme, accent, look, activeTab, currentScreen, pushAnim, activeTaskId, quickAddOpts, searchOpen, toast]);

  return (
    <AppContext.Provider value={value}>
      <ThemeContext.Provider value={theme}>
        {children}
      </ThemeContext.Provider>
    </AppContext.Provider>
  );
}

// ── Inner shell ───────────────────────────────────────────────────────────────
function MobileShell() {
  const ctx = React.useContext(AppContext);
  const {
    activeTab, navigate, currentScreen, pushAnim, openQuickAdd, openSearch,
    activeTaskId, quickAddOpts, searchOpen, toast,
    quickAddBarRef,
    _depthRef, _setActiveTaskId, _setQuickAddOpts, _setSearchOpen, _popStack,
  } = ctx;

  // popstate is the single state-mutation path for closes (UI X buttons call
  // history.back() which fires this; OS back / edge-swipe also fires this).
  // We close the deepest open layer in LIFO order and decrement our depth.
  // If anchor is reached and the user back-gestures again, re-push it so the
  // browser doesn't navigate away from the app silently.
  useEffect(() => {
    const onPop = () => {
      if (activeTaskId)              _setActiveTaskId(null);
      else if (quickAddOpts !== null) _setQuickAddOpts(null);
      else if (searchOpen)            _setSearchOpen(false);
      else                            _popStack();
      if (_depthRef.current > 0) _depthRef.current -= 1;
      // Re-anchor if we're at root and there's no state — keeps the user
      // inside the app instead of accidentally navigating to about:blank.
      try {
        if (!window.history.state || window.history.state.mobile !== 'anchor') {
          if (_depthRef.current === 0) {
            window.history.replaceState({ mobile: 'anchor' }, '');
          }
        }
      } catch {}
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [activeTaskId, quickAddOpts, searchOpen]);

  // Edge-swipe-back: touch starts within 20px of left edge and moves right
  // > 60px before any meaningful vertical motion → history.back(). Only fires
  // when there's an in-app layer to pop — otherwise the back call would land
  // on whatever the browser tab had before the app and silently exit us.
  useEffect(() => {
    let sx = 0, sy = 0, candidate = false, fired = false;
    const onStart = (e) => {
      const t = e.touches[0];
      if (!t) return;
      candidate = t.clientX <= 20;
      sx = t.clientX; sy = t.clientY; fired = false;
    };
    const onMove = (e) => {
      if (!candidate || fired) return;
      const t = e.touches[0];
      const dx = t.clientX - sx;
      const dy = Math.abs(t.clientY - sy);
      if (dy > 30) { candidate = false; return; }
      if (dx > 60) {
        fired = true;
        if (depthRef.current > 0) {
          try { window.history.back(); } catch {}
        }
      }
    };
    const onEnd = () => { candidate = false; fired = false; };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove',  onMove,  { passive: true });
    document.addEventListener('touchend',   onEnd,   { passive: true });
    document.addEventListener('touchcancel', onEnd,  { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove',  onMove);
      document.removeEventListener('touchend',   onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return (
    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--bg)', overflow:'hidden', fontFamily:'var(--font)', color:'var(--t1)', position:'relative' }}>
      <div style={{ flex:1, position:'relative', overflow:'hidden', minHeight:0 }}>
        <ScreenRouter screen={currentScreen} pushAnim={pushAnim} onSettingsBack={ctx.pop}/>
      </div>
      <BottomNav
        activeTab={activeTab}
        onNavigate={navigate}
        onQuickAdd={() => openQuickAdd({})}
        hidden={quickAddOpts !== null}
      />
      {searchOpen && <SearchScreen onClose={ctx.closeSearch}/>}
      {activeTaskId && <TaskDetailSheet taskId={activeTaskId} onClose={ctx.closeDetail}/>}
      <QuickAddBar ref={ctx.quickAddBarRef}/>
      {toast && <Toast message={toast}/>}
    </div>
  );
}

export default function MobileApp() {
  return (
    <AppProvider>
      <DataProvider>
        <MobileShell/>
      </DataProvider>
    </AppProvider>
  );
}
