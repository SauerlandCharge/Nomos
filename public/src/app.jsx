import React, { useState, useEffect, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { marked } from "marked";
import DOMPurify from "dompurify";
// Modellname dynamisch aus dem Backend (/healthz) — verhindert falsche Modellangaben im UI.
function modelLabel(id) {
  const map = {
    'claude-opus-4-7': 'Claude Opus 4.7',
    'claude-opus-4-6': 'Claude Opus 4.6',
    'claude-sonnet-4-6': 'Claude Sonnet 4.6',
    'claude-haiku-4-5': 'Claude Haiku 4.5',
  };
  if (!id) return 'Claude';
  return map[id] || ('Claude (' + id + ')');
}
function useModel() {
  const [name, setName] = useState('Claude');
  useEffect(() => {
    fetch('/healthz').then(r => r.json()).then(d => setName(modelLabel(d.model))).catch(() => {});
  }, []);
  return name;
}
// Build-Version aus dem Backend — macht einen veralteten lokalen Stand sichtbar.
function useVersion() {
  const [v, setV] = useState('');
  useEffect(() => {
    fetch('/healthz').then(r => r.json()).then(d => setV(d.version || '')).catch(() => {});
  }, []);
  return v;
}
// Auth-Zustand (E-Mail/Passwort; Cookie-Session). Cookies gehen same-origin automatisch mit.
function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  async function refresh() {
    try { const r = await fetch('/api/me'); const d = await r.json(); setUser(d.user); setProfile(d.profile); } catch {}
    setReady(true);
  }
  useEffect(() => { refresh(); }, []);
  async function login(email, password) {
    const r = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Login fehlgeschlagen');
    setUser(d.user); await refresh();
  }
  async function register(email, password, name) {
    const r = await fetch('/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password, name }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Registrierung fehlgeschlagen');
    setUser(d.user); await refresh();
  }
  async function logout() { try { await fetch('/api/auth/logout', { method:'POST' }); } catch {} setUser(null); setProfile(null); }
  return { user, profile, ready, login, register, logout, refresh, setProfile };
}

// Spracheingabe via Web Speech API (Chrome/Safari). Fällt sauber zurück, wenn nicht unterstützt.
function useSpeech(onText) {
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const SR = (typeof window !== 'undefined') && (window.SpeechRecognition || window.webkitSpeechRecognition);
  function toggle() {
    if (!SR) return;
    if (listening) { recRef.current && recRef.current.stop(); return; }
    const rec = new SR();
    rec.lang = 'de-DE'; rec.interimResults = false; rec.continuous = true;
    rec.onresult = (e) => { let t=''; for (let i=e.resultIndex;i<e.results.length;i++) if (e.results[i].isFinal) t += e.results[i][0].transcript; if (t.trim()) onText(t.trim()); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  }
  return { supported: !!SR, listening, toggle };
}

// Wiederverwendbarer Mikrofon-Button — überall dort, wo Text eingegeben wird.
function MicButton({ onText, className = '' }) {
  const s = useSpeech(onText);
  if (!s.supported) return null;
  return (
    <button type="button" onClick={s.toggle} title={s.listening ? 'Aufnahme stoppen' : 'Per Sprache diktieren'}
      className={"relative flex h-9 w-9 flex-none items-center justify-center rounded-full transition-colors "+(s.listening ? 'bg-terracotta text-cream-50' : 'border border-cream-400 text-ink-700 hover:border-ink-900')+' '+className}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
      </svg>
      {s.listening && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-honey dot-pulse" />}
    </button>
  );
}

/* ── Brand atoms ─────────────────────────────────────────────────────────── */
function Wordmark({ size=26, color='var(--ink-900)' }) {
  return <span style={{ fontFamily:"'Geist',sans-serif", fontSize:size, fontWeight:500, letterSpacing:'-0.055em', color, lineHeight:0.85 }}>Telos</span>;
}
function TelosLockup({ size=26, accent='var(--terracotta)' }) {
  return <span style={{ display:'inline-flex', alignItems:'baseline' }}><Wordmark size={size} />
    <span style={{ width:size*0.18, height:size*0.18, borderRadius:99, background:accent, display:'inline-block', marginLeft:size*0.06, transform:`translateY(-${size*0.02}px)` }} /></span>;
}
function ArcMark({ size=96, color='var(--terracotta)' }) {
  const sw = size*0.085;
  return <svg width={size} height={size*0.62} viewBox="0 0 100 62" fill="none" style={{ overflow:'visible' }}>
    <path d="M6 56 V28 A 44 44 0 0 1 94 28 V56" stroke={color} strokeWidth={sw} strokeLinecap="round" fill="none" /></svg>;
}
function NomosMark({ size=80, color='var(--cream-100)' }) {
  const sw = size*0.13;
  return <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <rect x="8" y="22" width="26" height={sw} rx={sw/2} fill={color} opacity="0.55" />
    <rect x="14" y="46" width="20" height={sw} rx={sw/2} fill={color} opacity="0.75" />
    <rect x="8" y="70" width="26" height={sw} rx={sw/2} fill={color} opacity="0.55" />
    <rect x="46" y="22" width={sw} height="62" rx={sw/2} fill={color} />
    <rect x="62" y="22" width="30" height={sw} rx={sw/2} fill={color} />
    <rect x="62" y="46" width="30" height={sw} rx={sw/2} fill={color} />
    <rect x="62" y="70" width="30" height={sw} rx={sw/2} fill={color} /></svg>;
}
// Sub-Brand-Glyphen (100×100, einfarbig) gemäß Sub-Brand-System.
function ElenchosMark({ size=80, color='var(--cobalt)' }) { // Audit-Siegel: Ring + Häkchen
  return <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="34" stroke={color} strokeWidth="7" /><circle cx="50" cy="50" r="24" stroke={color} strokeWidth="3" opacity="0.5" />
    <path d="M38 51 L47 60 L64 40" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>;
}
function MetronMark({ size=80, color='var(--terracotta)' }) { // Präzisions-Skala
  const sw = size*0.085;
  return <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <rect x="20" y="14" width={sw} height="72" rx={sw/2} fill={color} />
    {[24,38,52,66,80].map((y,i)=><rect key={y} x={20+sw} y={y} width={i===2?34:20} height={sw*0.8} rx={sw/2} fill={color} opacity={i===2?1:0.6} />)}
    <circle cx={20+sw+34} cy="52" r="6" fill={color} /></svg>;
}
function AgoraMark({ size=80, color='var(--honey)' }) { // Konstellation: Mitte + orbitende Knoten
  const cx=50,cy=50,r=30;
  return <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    {[0,60,120,180,240,300].map(a=>{const x=cx+r*Math.cos(a*Math.PI/180),y=cy+r*Math.sin(a*Math.PI/180);return <g key={a}><line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeWidth="2" opacity="0.4" /><circle cx={x} cy={y} r="6" fill={color} opacity="0.8" /></g>;})}
    <circle cx={cx} cy={cy} r="9" fill={color} /></svg>;
}
function HermesMark({ size=80, color='var(--sage)' }) { // Flügelspuren + Häkchen
  return <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <path d="M30 56 L46 70 L72 36" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M16 44 Q34 30 50 36" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.7" />
    <path d="M84 44 Q66 30 50 36" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.7" /></svg>;
}

// Wort, das vertikal nach unten durch vision-passende Begriffe wechselt.
function RotatingWord({ words, color='var(--terracotta)' }) {
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(()=>setI(x=>(x+1)%words.length), 2400); return ()=>clearInterval(id); }, []);
  return <span className="relative inline-block align-baseline"><em key={i} className="rot-word brand-serif italic" style={{ color, fontStyle:'italic' }}>{words[i]}</em></span>;
}

const Eyebrow = ({ children, className='' }) => (
  <div className={"brand-mono uppercase text-ink-500 "+className} style={{ fontSize:10, letterSpacing:'0.18em' }}>{children}</div>);
function NomosBadge() {
  return <span className="inline-flex items-center gap-2 rounded-full bg-cream-200 px-3 py-1.5">
    <NomosMark size={14} color="var(--ink-900)" />
    <span className="brand-mono text-ink-900" style={{ fontSize:11, letterSpacing:'0.14em' }}>NOMOS · INSIDE</span></span>;
}

const SAMPLES = [
  { proj:'Helios', text:'Wir bauen eine Plug-&-Play-Battery, die jeder Hausbesitzer an seine bestehende Solaranlage hängen kann. Massiv günstiger als alles am Markt — und in 20 Minuten installiert. Sitz in Bayern, noch vor der Gründung, kommen aus der TU München.' },
  { proj:'MediFlow', text:'Unsere App nutzt KI, um Patientendaten in Kliniken automatisch zu strukturieren. Spart Pflegekräften krass viel Zeit und reduziert Doku-Fehler. Wir sind ein Seed-Startup aus Berlin, suchen FuE-Förderung.' },
  { proj:'GridSense', text:'Wir entwickeln ein KI-Tool zur Vorhersage von Lastspitzen im Stromnetz. Netzbetreiber verteilen Energie effizienter und vermeiden teure Engpässe. Forschungsbasierte Ausgründung, NRW.' },
];

/* ── Marketing pages ─────────────────────────────────────────────────────── */
function Marketing({ page, go, startPitch }) {
  if (page==='produkt')       return <PageProdukt startPitch={startPitch} />;
  if (page==='engine')        return <PageEngine startPitch={startPitch} />;
  if (page==='foerderlinien') return <PageFoerderlinien startPitch={startPitch} />;
  if (page==='preise')        return <PagePreise startPitch={startPitch} />;
  if (page==='vision')        return <PageVision startPitch={startPitch} go={go} />;
  return null;
}

// Produktfamilie von Telos — Nomos ist live, der Rest ist Roadmap.
// Produktfamilie — verbindlich aus dem Sub-Brand-System. Reihenfolge = Gründungs-Reise.
const PRODUCTS = [
  { name: 'Nomos',    greek: 'νόμος · Gesetz',     funktion: 'Fördermittel-Copilot',          tagline: 'Vom Pitch zum Bescheid.',            benefit: 'Findet passende Förderungen und schreibt 80 % des Antrags — dein Start ins Unternehmertum.', color: '#26221C', Glyph: NomosMark,    status: 'live' },
  { name: 'Metron',   greek: 'μέτρον · Maß',       funktion: 'Rating-Ready-Generator',        tagline: 'Was die Bank misst.',                benefit: 'Macht deinen Businessplan bank- & rating-fähig: Kapitaldienst, Branchenrisiko, Eigenmittelquote.', color: '#C26A4C', Glyph: MetronMark,   status: 'geplant' },
  { name: 'Agora',    greek: 'ἀγορά · Marktplatz', funktion: 'Vergabe-Marktplatz',            tagline: 'Wo Anbieter sich finden.',           benefit: 'Scannt öffentliche Ausschreibungen (TED, eVergabe) und erstellt strukturierte Bietungsangebote.', color: '#D5A55B', Glyph: AgoraMark,    status: 'geplant' },
  { name: 'Elenchos', greek: 'ἔλεγχος · Prüfung',  funktion: 'Verwendungsnachweis-Generator', tagline: 'Behauptung. Geprüft.',               benefit: 'Überführt nach der Förderzusage deine Belege in prüfsichere, formale Verwendungsnachweise.', color: '#4D6A8B', Glyph: ElenchosMark, status: 'geplant' },
  { name: 'Hermes',   greek: 'Ἑρμῆς · Bote',       funktion: 'Vertrags-Übersetzer',           tagline: 'Juristisch lesen, menschlich verstehen.', benefit: 'Analysiert Verträge auf nachteilige Klauseln und übersetzt Juristendeutsch in Handlungsempfehlungen.', color: '#8A9A78', Glyph: HermesMark,   status: 'geplant' },
];
const VISION_WORDS = ['entbürokratisiert', 'einfacher', 'schneller', 'planbar', 'finanzierbar', 'machbar'];

function ProductCard({ p, n, go }) {
  const dark = p.status === 'live';
  return (
    <div className="overflow-hidden rounded-3xl border border-cream-300 transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-20px_rgba(40,30,20,0.4)]" style={dark ? { background:'#26221C' } : { background:'var(--cream-50)' }}>
      <div className="flex items-center justify-between gap-3 p-5" style={dark ? {} : { background: p.color + '14' }}>
        <div className="flex items-center gap-3">
          <p.Glyph size={34} color={dark ? '#F1ECDE' : p.color} />
          <div>
            <div className="font-sans" style={{ fontSize:22, fontWeight:500, letterSpacing:'-0.045em', lineHeight:1, color: dark ? '#F7F2E7' : 'var(--ink-900)' }}>{p.name.toLowerCase()}</div>
            <div className="brand-mono mt-1" style={{ fontSize:9, letterSpacing:'0.12em', color: dark ? 'rgba(245,240,230,0.6)' : 'var(--ink-500)' }}>{p.greek}</div>
          </div>
        </div>
        <span className="brand-mono rounded-full px-2.5 py-0.5" style={{ fontSize:9, letterSpacing:'0.12em', background: dark ? '#D5A55B' : p.color, color: dark ? '#26221C' : '#F7F2E7' }}>{dark ? '● LIVE' : 'GEPLANT'}</span>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-2">
          <span className="brand-mono" style={{ fontSize:9, letterSpacing:'0.14em', color: dark ? 'rgba(245,240,230,0.5)' : 'var(--ink-300)' }}>{String(n).padStart(2,'0')}</span>
          <span className="brand-mono uppercase" style={{ fontSize:9, letterSpacing:'0.14em', color: dark ? 'rgba(245,240,230,0.6)' : 'var(--ink-500)' }}>{p.funktion}</span>
        </div>
        <div className="mt-1 brand-serif italic" style={{ fontSize:18, color: dark ? '#F7F2E7' : 'var(--ink-900)' }}>{p.tagline}</div>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: dark ? 'rgba(245,240,230,0.85)' : 'var(--ink-700)' }}>{p.benefit}</p>
        {dark && go && <button onClick={()=>go('engine')} className="brand-mono mt-3 hover:underline" style={{ fontSize:10, letterSpacing:'0.1em', color:'#D5A55B' }}>MEHR ZUR ENGINE →</button>}
      </div>
    </div>
  );
}

function PageVision({ startPitch, go }) {
  return (
    <PageShell>
      <PageHero eyebrow="VISION · TELOS"
        title={<>Gründen, <RotatingWord words={VISION_WORDS} />.</>}
        lede="Telos macht aus rohen Startup-Visionen strukturierte institutionelle Realität. Wir nehmen Gründer:innen die bürokratischen Hürden ab — von der Idee bis zum laufenden Betrieb, mit einer Familie von KI-Modulen für jede Phase." />

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <div className="rounded-3xl bg-ink-900 p-8 text-cream-100 md:p-10">
          <div className="brand-mono" style={{ fontSize:11, letterSpacing:'0.18em', color:'rgba(245,240,230,0.6)' }}>UNSERE MISSION</div>
          <p className="mt-4 brand-serif italic" style={{ fontSize:26, lineHeight:1.25 }}>„Fünf Sprachen der Bürokratie. Eine Familie. Damit jede gute Idee an sich selbst gemessen wird — nicht an Formularen."</p>
          <p className="mt-4 text-sm leading-relaxed text-cream-300">Telos begleitet Gründer:innen von Anfang an: jedes Modul löst eine konkrete bürokratische Hürde — zusammen ein durchgängiger Partner für die ganze Gründung.</p>
        </div>
        <div className="flex flex-col justify-center gap-3">
          {['Weniger Bürokratie, mehr Unternehmertum.','Ein KI-Modul für jede Gründungsphase.','Durchgängig statt Insellösungen — eine Familie.'].map((t,i)=>(
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-cream-300 bg-cream-50 p-4"><ArcMark size={22} color="#E2AC92" /><span className="text-sm font-medium text-ink-900">{t}</span></div>))}
        </div>
      </div>

      <div className="mt-14"><SectionLabel>DIE PRODUKTFAMILIE · DEINE GRÜNDUNGS-REISE</SectionLabel>
        <p className="mb-5 max-w-2xl text-sm leading-relaxed text-ink-700"><strong className="text-ink-900">Nomos ist der erste Schritt</strong> — live und einsatzbereit. Vier Schwester-Module folgen derselben Marken-Grammatik (griechischer Name, eigener Glyph, eigene Farbe) und greifen entlang der Gründung ineinander.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {PRODUCTS.map((p,i)=><ProductCard key={p.name} p={p} n={i+1} go={go} />)}
        </div>
      </div>

      <CTAband startPitch={startPitch} />
    </PageShell>
  );
}

const PageShell = ({ children }) => <main className="anim-fadein mx-auto max-w-6xl px-6 pb-20 pt-12 md:px-12">{children}</main>;

function PageHero({ eyebrow, title, lede, children }) {
  return (
    <header className="relative overflow-hidden pb-2">
      <div className="pointer-events-none absolute -right-16 -top-20 z-0 hidden opacity-50 md:block"><ArcMark size={420} color="#E2AC92" /></div>
      <div className="relative z-10">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-4 font-sans" style={{ fontSize:'clamp(38px,6vw,66px)', fontWeight:400, letterSpacing:'-0.04em', lineHeight:0.97 }}>{title}</h1>
        {lede && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-700">{lede}</p>}
        {children}
      </div>
    </header>
  );
}

const Chip = ({ children }) => (
  <span className="brand-mono rounded-full border border-cream-400 px-2.5 py-1 text-ink-500" style={{ fontSize:10, letterSpacing:'0.06em' }}>{children}</span>);

const SectionLabel = ({ children }) => (
  <div className="mb-5 flex items-center gap-3">
    <ArcMark size={22} color="var(--terracotta)" />
    <Eyebrow>{children}</Eyebrow>
  </div>);

function PrimaryBtn({ onClick, children }) {
  return <button onClick={onClick} className="rounded-full bg-ink-900 px-6 py-3 text-sm font-medium text-cream-100 transition-transform hover:scale-[1.03]">{children}</button>;
}
function GhostBtn({ onClick, children }) {
  return <button onClick={onClick} className="rounded-full border border-ink-900 px-6 py-3 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-900 hover:text-cream-100">{children}</button>;
}

function CTAband({ startPitch }) {
  return (
    <div className="relative mt-16 flex flex-col items-start gap-5 overflow-hidden rounded-3xl bg-ink-900 p-8 text-cream-100 md:flex-row md:items-center md:justify-between md:p-10">
      <div className="pointer-events-none absolute -right-10 -bottom-12 opacity-[0.12]"><ArcMark size={300} color="var(--terracotta)" /></div>
      <div className="relative flex items-center gap-4">
        <NomosMark size={36} color="var(--cream-100)" />
        <div>
          <div className="brand-mono" style={{ fontSize:10, letterSpacing:'0.16em', color:'rgba(245,240,230,0.55)' }}>NOMOS · INSIDE</div>
          <div className="brand-serif italic" style={{ fontSize:26, lineHeight:1.1 }}>Vom Pitch zum Bescheid. Reibungslos.</div>
        </div>
      </div>
      <button onClick={startPitch} className="relative rounded-full bg-cream-50 px-6 py-3 text-sm font-medium text-ink-900 transition-transform hover:scale-[1.03]">Pitch hochladen →</button>
    </div>
  );
}

/* Produkt */
function PageProdukt({ startPitch }) {
  const feats = [
    ['Dokument-Analyse', 'Nomos liest dein PDF, DOCX oder deinen Text und versteht Vorhaben, Phase und Region — ganz ohne Vorlagen.'],
    ['Hyperlokales Matching', 'Abgleich mit kuratierten Förderlinien aus Bund, Ländern und EU — jede mit Konfidenz und ehrlicher Begründung.'],
    ['Behörden-Übersetzung', 'Gründer-Slang wird zu präzisem Behördendeutsch — nominalstil, sachlich, ohne erfundene Fakten.'],
    ['Antrags-Entwurf', '80 % des offiziellen Antrags als strukturierter Entwurf — exportierbar, mit klaren „Bitte ergänzen“-Markern.'],
  ];
  const steps = [
    ['01','Plan einlesen','Lade Pitch-Deck oder Businessplan hoch — oder füge deinen Text ein.'],
    ['02','Hyperlokal matchen','Nomos findet passende Töpfe und bewertet jede Förderlinie.'],
    ['03','Übersetzen','Ein Klick verwandelt Slang in formelles Behördendeutsch.'],
    ['04','Antrag generieren','80 % des Antrags entstehen live — exportierbar als PDF.'],
  ];
  return (
    <PageShell>
      <PageHero eyebrow="PRODUKT · TELOS"
        title={<>Ein Antrag.<br/>Vier Schritte.<br/><em className="brand-serif italic" style={{ fontWeight:400 }}>Achtzig Prozent</em> weniger Arbeit.</>}
        lede="Telos übersetzt deinen Businessplan in formelle Fördersprache — findet passende Töpfe und schreibt den Großteil des Antrags. Auf Knopfdruck.">
        <div className="mt-8 flex flex-wrap gap-3"><PrimaryBtn onClick={startPitch}>Pitch hochladen</PrimaryBtn><GhostBtn onClick={startPitch}>Live ausprobieren</GhostBtn></div>
      </PageHero>

      <div className="mt-16"><SectionLabel>WAS NOMOS LEISTET</SectionLabel>
        <div className="grid gap-3 md:grid-cols-2">
          {feats.map(([t,d],i)=>(
            <div key={t} className="rounded-3xl border border-cream-300 bg-cream-50 p-6">
              <div className="flex items-center gap-3">
                <span className="brand-mono text-terracotta" style={{ fontSize:11, letterSpacing:'0.14em' }}>{String(i+1).padStart(2,'0')}</span>
                <div className="text-base font-medium text-ink-900">{t}</div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{d}</p>
            </div>))}
        </div>
      </div>

      <div className="mt-16"><SectionLabel>SO FUNKTIONIERT'S</SectionLabel>
        <div className="grid gap-3 md:grid-cols-4">
          {steps.map(([n,t,d])=>(
            <div key={n} className="rounded-2xl border border-cream-300 bg-cream-100 p-5">
              <span className="brand-mono text-ink-300" style={{ fontSize:11, letterSpacing:'0.14em' }}>{n}</span>
              <div className="mt-2 text-sm font-medium text-ink-900">{t}</div>
              <p className="mt-1 text-sm leading-relaxed text-ink-700">{d}</p>
            </div>))}
        </div>
      </div>

      <div className="mt-16"><SectionLabel>NOMOS · LIVE</SectionLabel>
        <div className="grid items-stretch gap-3 md:grid-cols-[1fr_56px_1fr]">
          <div className="rounded-2xl border border-cream-300 bg-cream-50 p-5">
            <div className="brand-mono mb-2 text-ink-500" style={{ fontSize:10, letterSpacing:'0.14em' }}>GRÜNDER-SLANG</div>
            <p className="text-sm leading-relaxed text-ink-900">„Wir disrupten den Förder­markt mit KI und skalieren Bewilligungs­quoten exponentiell.“</p>
          </div>
          <div className="flex items-center justify-center"><ArcMark size={34} color="var(--terracotta)" /></div>
          <div className="rounded-2xl bg-ink-900 p-5 text-cream-100">
            <div className="brand-mono mb-2" style={{ fontSize:10, letterSpacing:'0.14em', color:'rgba(245,240,230,0.5)' }}>BEHÖRDEN-DEUTSCH</div>
            <p className="text-sm leading-relaxed">„Entwicklung einer KI-gestützten Software­plattform zur effizienteren Vermittlung öffentlicher Fördermittel mit messbar erhöhter Antrags­erfolgs­quote.“</p>
          </div>
        </div>
      </div>

      <CTAband startPitch={startPitch} />
    </PageShell>
  );
}

/* Architektur-Diagramm (markenkonform, responsiv) */
function ArchBox({ tone, eyebrow, title, lines, mark }) {
  const dark = tone === 'dark';
  return (
    <div className={"flex-1 rounded-2xl p-4 "+(dark ? "bg-ink-900 text-cream-100" : "border border-cream-300 bg-cream-50")}>
      <div className="flex items-center gap-2">
        {mark}
        <span className="brand-mono uppercase" style={{ fontSize:9, letterSpacing:'0.14em', color: dark ? 'rgba(245,240,230,0.55)' : 'var(--ink-500)' }}>{eyebrow}</span>
      </div>
      <div className={"mt-1 text-sm font-medium "+(dark ? "text-cream-100" : "text-ink-900")}>{title}</div>
      <ul className="mt-2 flex flex-col gap-1">
        {lines.map((l,i)=>(
          <li key={i} className="brand-mono" style={{ fontSize:10, letterSpacing:'0.04em', color: dark ? 'rgba(245,240,230,0.75)' : 'var(--ink-700)' }}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
const ArchArrow = ({ label }) => (
  <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-1 py-2 md:py-0">
    <span className="brand-mono text-ink-500" style={{ fontSize:9, letterSpacing:'0.1em' }}>{label}</span>
    <span className="text-terracotta md:rotate-0" style={{ fontSize:18, lineHeight:1 }}>→</span>
  </div>
);

function ArchitectureDiagram({ model }) {
  return (
    <div className="rounded-3xl border border-cream-300 bg-cream-100 p-5 md:p-7">
      {/* Hauptfluss */}
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-stretch">
        <ArchBox tone="light" eyebrow="1 · IM BROWSER" title="Telos · Web-Oberfläche"
          mark={<TelosLockup size={16} />}
          lines={['Pitch / Businessplan','PDF · DOCX · Text','kein API-Key im Browser']} />
        <ArchArrow label="HTTPS" />
        <ArchBox tone="dark" eyebrow="2 · SICHERES BACKEND" title="Node · Express (serverseitig)"
          mark={<span className="text-honey" style={{ fontSize:12 }}>●</span>}
          lines={['/api/analyze','/api/livesearch','/api/translate','/api/generate','ANTHROPIC_API_KEY hier']} />
        <ArchArrow label="API" />
        <ArchBox tone="light" eyebrow="3 · KI-ENGINE" title={model}
          mark={<NomosMark size={16} color="var(--ink-900)" />}
          lines={['adaptive thinking','prompt caching','strukturierte Outputs']} />
      </div>
      {/* Quellen */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl border border-cream-300 bg-cream-50 p-4">
          <span className="brand-mono uppercase text-cobalt" style={{ fontSize:9, letterSpacing:'0.14em' }}>DATENQUELLE</span>
          <div className="mt-1 text-sm font-medium text-ink-900">Kuratierte Förder-Datenbank</div>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">Programme aus Bund, Ländern & EU — Claude matcht & begründet.</p>
        </div>
        <div className="rounded-2xl border border-cream-300 bg-cream-50 p-4">
          <span className="brand-mono uppercase text-cobalt" style={{ fontSize:9, letterSpacing:'0.14em' }}>DATENQUELLE</span>
          <div className="mt-1 text-sm font-medium text-ink-900">Live-Websuche (web_search)</div>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">Findet aktuelle, reale Programme im Web — mit Quell-Links.</p>
        </div>
      </div>
      {/* Rückkanal */}
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-cream-200 px-4 py-3">
        <ArcMark size={26} color="var(--terracotta)" />
        <span className="brand-mono text-ink-700" style={{ fontSize:11, letterSpacing:'0.06em' }}>
          RÜCKKANAL · gestreamt → Analyse · Übersetzung · Antragsentwurf
        </span>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-ink-700">
        <strong className="text-ink-900">Dein API-Key bleibt im Backend</strong> — niemals im Browser. Pläne werden zur
        Verarbeitung an die Anthropic-API gesendet und nicht dauerhaft gespeichert.
      </p>
    </div>
  );
}

/* Nomos-Engine */
function PageEngine({ startPitch }) {
  const caps = [
    ['Analyse', 'Versteht Vorhaben, Phase und Region aus PDF, DOCX oder Text.'],
    ['Matching', 'Kuratierte Förderdatenbank + Live-Websuche nach aktuellen Programmen.'],
    ['Übersetzung', 'Gründer-Slang → Behördendeutsch, ohne neue Fakten zu erfinden.'],
    ['Antrag', 'Strukturierter Entwurf von ~80 % des Förderantrags.'],
  ];
  const model = useModel();
  const tech = [model,'Strukturierte Outputs','Live-Websuche','Prompt-Caching','PDF & DOCX nativ','Serverseitig & sicher'];
  return (
    <PageShell>
      <PageHero eyebrow="SUB-BRAND · DIE KI-ENGINE"
        title={<>Nomos. <em className="brand-serif italic" style={{ fontWeight:400 }}>Im Inneren.</em></>}
        lede="Nomos (griech. νόμος — Gesetz, Ordnung) ist die Übersetzungs-Engine von Telos. Sie spricht beide Sprachen — Gründer-Slang und Behördendeutsch. Eigene Marke, gleiche Familie." />

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl bg-ink-900 p-8 text-cream-100 md:p-10" style={{ minHeight:340 }}>
          <div className="flex items-center justify-between">
            <span className="brand-mono" style={{ fontSize:11, letterSpacing:'0.18em', color:'rgba(245,240,230,0.6)' }}>ENGINE · v1.0</span>
            <span className="brand-mono" style={{ fontSize:11, letterSpacing:'0.18em', color:'rgba(245,240,230,0.6)' }}>POWERED BY TELOS</span>
          </div>
          <div className="flex items-center gap-6 py-8">
            <NomosMark size={88} color="var(--cream-100)" />
            <div>
              <div className="font-sans" style={{ fontSize:'clamp(56px,9vw,84px)', fontWeight:400, letterSpacing:'-0.055em', lineHeight:0.85 }}>nomos</div>
              <div className="brand-mono mt-3" style={{ fontSize:11, letterSpacing:'0.18em', color:'rgba(245,240,230,0.55)' }}>THE TRANSLATION ENGINE</div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <span className="brand-mono" style={{ fontSize:11, color:'rgba(245,240,230,0.55)' }}>FOUNDER → BEHÖRDE</span>
            <span className="brand-mono" style={{ fontSize:11, color:'var(--honey)' }}>● READY</span>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {caps.map(([t,d])=>(
            <div key={t} className="flex items-start gap-3 rounded-2xl border border-cream-300 bg-cream-50 p-5">
              <NomosMark size={22} color="var(--ink-900)" />
              <div><div className="text-sm font-medium text-ink-900">{t}</div><p className="mt-1 text-sm leading-relaxed text-ink-700">{d}</p></div>
            </div>))}
        </div>
      </div>

      <div className="mt-12"><SectionLabel>UNTER DER HAUBE</SectionLabel>
        <div className="flex flex-wrap gap-2">{tech.map(t=><Chip key={t}>{t}</Chip>)}</div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-700">
          Jeder Aufruf läuft serverseitig über die offizielle Anthropic-API — dein API-Key bleibt im Backend und gelangt nie in den Browser.
          Hochgeladene Pläne werden zur Verarbeitung gesendet und nicht dauerhaft gespeichert.
        </p>
      </div>

      <div className="mt-12"><SectionLabel>VERARBEITUNGS-PIPELINE</SectionLabel>
        <div className="rounded-3xl border border-cream-300 bg-cream-50 p-5 md:p-7">
          {/* 4-Stufen-Pipeline */}
          <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
            {[['01','Pitch-Upload','PDF · DOCX · Text'],
              ['02','Semantische Analyse & Caching','Vorhaben verstehen'],
              ['03','Förder-Matching','kuratiert + live'],
              ['04','80 % Antrag (Stream)','Behördendeutsch']].map(([n,t,d],i,arr)=>(
              <React.Fragment key={n}>
                <div className="flex-1 rounded-2xl border border-cream-300 bg-cream-100 p-4">
                  <span className="brand-mono text-terracotta" style={{ fontSize:10, letterSpacing:'0.14em' }}>{n}</span>
                  <div className="mt-1 text-sm font-medium text-ink-900">{t}</div>
                  <div className="brand-mono mt-1 text-ink-500" style={{ fontSize:10 }}>{d}</div>
                </div>
                {i < arr.length-1 && <span className="self-center text-terracotta md:px-1" style={{ fontSize:18 }}>➔</span>}
              </React.Fragment>
            ))}
          </div>
          {/* Erklärspalten */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-cream-300 bg-cream-100 p-4">
              <div className="text-sm font-medium text-ink-900">Nüchternes Scoring</div>
              <p className="mt-1 text-sm leading-relaxed text-ink-700">Objektive Bewertung anhand harter Kriterien — Themenfokus, Phase und Region. Keine Schönfärberei: schwache Treffer werden als solche benannt.</p>
            </div>
            <div className="rounded-2xl border border-cream-300 bg-cream-100 p-4">
              <div className="text-sm font-medium text-ink-900">Prompt Caching</div>
              <p className="mt-1 text-sm leading-relaxed text-ink-700">Hohe Performance durch Anthropics ephemeres Prompt-Caching der statischen Förderdatenbank — wiederkehrende Kontexte werden nicht erneut voll berechnet.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12"><SectionLabel>SYSTEM-ARCHITEKTUR</SectionLabel>
        <ArchitectureDiagram model={model} />
      </div>

      <CTAband startPitch={startPitch} />
    </PageShell>
  );
}

// Zugänglicher Modal-Wrapper: Escape schließt, Fokus-Falle, Scroll-Lock, Fokus-Rückgabe.
function Modal({ onClose, children, className='max-w-xl', label='Dialog' }) {
  const ref = useRef(null);
  const prev = useRef(null);
  useEffect(() => {
    prev.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const sel = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(ref.current ? ref.current.querySelectorAll(sel) : []);
    const t = setTimeout(() => { const f = focusables(); (f[0] || ref.current)?.focus?.(); }, 0);
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
      if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) { e.preventDefault(); return; }
        const first = f[0], last = f[f.length-1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey, true); document.body.style.overflow = prevOverflow; try { prev.current?.focus?.(); } catch {} };
  }, []);
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        className={"anim-pop max-h-[88vh] w-full overflow-auto rounded-3xl border border-cream-300 bg-cream-50 p-7 shadow-card outline-none "+className}
        onClick={(e)=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* Förderlinien */
// Detailansicht einer Förderung — mit Live-Auflösung der konkreten Programm-/Formular-URL.
function GrantDetail({ grant, onClose, startPitch }) {
  const [res, setRes] = useState(null);   // {url, formUrl, hinweis}
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!grant) return null;
  async function resolve() {
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/resolve', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: grant.name, provider: grant.provider, region: grant.region }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || ('Fehler '+r.status));
      setRes(d);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const Link = ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="brand-mono text-cobalt hover:underline" style={{ fontSize:11, letterSpacing:'0.06em' }}>{children} ↗</a>;
  return (
    <Modal onClose={onClose} className="max-w-xl" label={`Förderdetails: ${grant.name}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.12em' }}>{grant.region} · {grant.provider}</div>
            <h2 className="mt-1 font-sans" style={{ fontSize:22, fontWeight:500, letterSpacing:'-0.02em' }}>{grant.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Schließen" className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-cream-400 text-ink-700 hover:border-ink-900">✕</button>
        </div>
        {grant.summary && <p className="mt-3 text-sm leading-relaxed text-ink-700">{grant.summary}</p>}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1">
          <div><div className="brand-mono text-ink-500" style={{ fontSize:9, letterSpacing:'0.12em' }}>FÖRDERHÖHE</div><div className="text-sm text-ink-900">{grant.amount}</div></div>
          <div><div className="brand-mono text-ink-500" style={{ fontSize:9, letterSpacing:'0.12em' }}>QUOTE</div><div className="text-sm text-ink-900">{grant.fundingRate}</div></div>
        </div>
        {(grant.requirements||[]).length>0 && (
          <div className="mt-4">
            <div className="brand-mono uppercase text-ink-500" style={{ fontSize:9, letterSpacing:'0.12em' }}>HARTE ANFORDERUNGEN</div>
            <ul className="mt-1.5 flex flex-col gap-1">{grant.requirements.map((r,i)=>(
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-700"><span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-terracotta" /><span>{r}</span></li>))}</ul>
          </div>)}
        <div className="mt-4 flex flex-wrap gap-1.5">{(grant.focus||[]).slice(0,6).map(f=><Chip key={f}>{f}</Chip>)}</div>

        <div className="mt-5 rounded-2xl border border-cream-300 bg-cream-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="brand-mono uppercase text-ink-500" style={{ fontSize:10, letterSpacing:'0.12em' }}>Konkrete Quelle</span>
            <button onClick={resolve} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-cobalt px-3.5 py-1.5 text-xs text-ink-900 transition-colors enabled:hover:bg-cobalt enabled:hover:text-cream-50 disabled:opacity-40">
              {busy ? <><span className="spin"><NomosMark size={12} color="var(--cobalt)" /></span> sucht …</> : 'Konkrete Seite + Formular finden'}
            </button>
          </div>
          {err && <p className="mt-2 text-sm text-ink-700">{err}</p>}
          {res && (
            <div className="mt-2 flex flex-col gap-1">
              {res.hinweis && <p className="text-sm leading-relaxed text-ink-700">{res.hinweis}</p>}
              {res.url ? <Link href={res.url}>Zur konkreten Förderseite</Link> : <span className="text-sm text-ink-500">Keine konkrete URL gefunden.</span>}
              {res.formUrl && <Link href={res.formUrl}>Antragsformular / Merkblatt</Link>}
            </div>)}
          {!res && !busy && grant.url && <div className="mt-2"><Link href={grant.url}>Programm-Übersicht (Quelle prüfen)</Link></div>}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={()=>{ onClose(); startPitch(); }} className="rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-cream-100 transition-transform hover:scale-[1.03]">Mit Pitch starten →</button>
          <span className="brand-mono self-center text-ink-500" style={{ fontSize:10 }}>Lade deinen Plan hoch, um den Antrag zu erstellen.</span>
        </div>
    </Modal>
  );
}

function PageFoerderlinien({ startPitch }) {
  const [grants, setGrants] = useState([]);
  const [filter, setFilter] = useState('alle');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');
  const [detail, setDetail] = useState(null);
  useEffect(() => { fetch('/api/grants').then(r=>r.json()).then(setGrants).catch(()=>{}); }, []);
  const levels = [['alle','Alle'],['national','Bund'],['land','Länder'],['eu','EU']];
  const ql = q.trim().toLowerCase();
  const shown = grants
    .filter(g => filter==='alle' || g.level===filter)
    .filter(g => !ql || [g.name, g.provider, g.summary, g.eligibility, (g.focus||[]).join(' ')].join(' ').toLowerCase().includes(ql))
    .sort((a,b)=> sort==='region' ? String(a.region).localeCompare(String(b.region)) : String(a.name).localeCompare(String(b.name)));
  return (
    <PageShell>
      <PageHero eyebrow="FÖRDERLINIEN"
        title={<>{grants.length || ''} kuratierte Töpfe.<br/><em className="brand-serif italic" style={{ fontWeight:400 }}>Bund, Länder, EU.</em></>}
        lede="Diese Programme kennt Nomos sofort. Klick auf eine Förderung öffnet Details samt konkreter Quelle; per Live-Websuche kommen aktuelle Programme dazu." />

      {/* Schnellsuche + Filter + Sortierung */}
      <div className="mt-8 flex flex-col gap-3">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Schnellsuche — z. B. Klima, KI, Bayern, Gründung …"
          className="w-full rounded-xl border border-cream-300 bg-cream-100 px-4 py-3 text-sm outline-none transition-colors placeholder:text-ink-300 focus:border-ink-900" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {levels.map(([k,l])=>(
              <button key={k} onClick={()=>setFilter(k)}
                className={"rounded-full px-4 py-2 text-xs transition-colors "+(filter===k ? 'bg-ink-900 text-cream-100' : 'border border-cream-400 text-ink-700 hover:border-ink-900')}>{l}</button>))}
          </div>
          <div className="flex items-center gap-2">
            <span className="brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.12em' }}>SORTIERUNG</span>
            <select value={sort} onChange={e=>setSort(e.target.value)} className="rounded-full border border-cream-400 bg-cream-50 px-3 py-1.5 text-xs text-ink-900 outline-none">
              <option value="name">Name (A–Z)</option>
              <option value="region">Region</option>
            </select>
          </div>
        </div>
        <div className="brand-mono text-ink-500" style={{ fontSize:10 }}>{shown.length} von {grants.length} angezeigt</div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {shown.map(g=>(
          <button key={g.id} onClick={()=>setDetail(g)} className="relative rounded-3xl border border-cream-300 bg-cream-50 p-6 text-left transition-all hover:-translate-y-0.5 hover:border-ink-900 hover:shadow-[0_14px_36px_-18px_rgba(40,30,20,0.35)]">
            <div className="pointer-events-none absolute right-5 top-5 opacity-20"><NomosMark size={18} color="var(--ink-900)" /></div>
            <div className="brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.12em' }}>{g.region}</div>
            <div className="mt-1 pr-6 text-base font-medium text-ink-900">{g.name}</div>
            <div className="mt-1 text-sm text-ink-700">{g.provider}</div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1">
              <div><div className="brand-mono text-ink-500" style={{ fontSize:9, letterSpacing:'0.12em' }}>FÖRDERHÖHE</div><div className="text-sm text-ink-900">{g.amount}</div></div>
              <div><div className="brand-mono text-ink-500" style={{ fontSize:9, letterSpacing:'0.12em' }}>QUOTE</div><div className="text-sm text-ink-900">{g.fundingRate}</div></div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">{g.summary || g.eligibility}</p>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">{(g.focus||[]).slice(0,5).map(f=><Chip key={f}>{f}</Chip>)}<span className="brand-mono ml-auto text-cobalt" style={{ fontSize:10 }}>Details ↗</span></div>
          </button>))}
        {shown.length===0 && <div className="rounded-2xl border border-cream-300 bg-cream-50 p-5 text-sm text-ink-700 md:col-span-2">Keine Treffer — Suche anpassen oder Filter zurücksetzen.</div>}
      </div>
      <p className="mt-5 brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.1em' }}>● BETRÄGE & QUOTEN SIND RICHTWERTE — VOR ANTRAGSTELLUNG ÜBER OFFIZIELLE QUELLEN PRÜFEN</p>

      <CTAband startPitch={startPitch} />
      {detail && <GrantDetail grant={detail} onClose={()=>setDetail(null)} startPitch={startPitch} />}
    </PageShell>
  );
}

/* Preise */
function PagePreise({ startPitch }) {
  const tiers = [
    { name:'Solo', price:'0 €', per:'für den Start', highlight:false,
      features:['Plan-Analyse mit KI','Hyperlokales Matching','Behörden-Übersetzung','1 Antragsentwurf / Monat'], cta:'Kostenlos starten' },
    { name:'Pro', price:'49 €', per:'/ Monat', highlight:true,
      features:['Alles aus Solo','Unbegrenzte Antragsentwürfe','Live-Websuche nach Programmen','PDF & DOCX-Upload','PDF-Export'], cta:'Pro wählen' },
    { name:'Team', price:'199 €', per:'/ Monat', highlight:false,
      features:['Alles aus Pro','Bis zu 10 Nutzer:innen','Geteilte Antragsbibliothek','Prioritäts-Support'], cta:'Team anfragen' },
  ];
  return (
    <PageShell>
      <PageHero eyebrow="PREISE"
        title={<>Transparent. <em className="brand-serif italic" style={{ fontWeight:400 }}>Nutzungsbasiert.</em></>}
        lede="Starte kostenlos. Skaliere, wenn du mehr Anträge stellst. Keine versteckten Kosten." />

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {tiers.map(t=>(
          <div key={t.name}
            className={"relative flex flex-col rounded-3xl p-7 "+(t.highlight ? 'bg-ink-900 text-cream-100' : 'border border-cream-300 bg-cream-50 text-ink-900')}>
            {t.highlight && <span className="brand-mono absolute right-6 top-6 rounded-full bg-honey px-2.5 py-1 text-ink-900" style={{ fontSize:9, letterSpacing:'0.12em' }}>BELIEBT</span>}
            <div className="brand-mono uppercase" style={{ fontSize:10, letterSpacing:'0.16em', color:t.highlight?'rgba(245,240,230,0.55)':'var(--ink-500)' }}>{t.name}</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-sans" style={{ fontSize:40, fontWeight:500, letterSpacing:'-0.03em' }}>{t.price}</span>
              <span className="text-sm" style={{ color:t.highlight?'rgba(245,240,230,0.6)':'var(--ink-500)' }}>{t.per}</span>
            </div>
            <ul className="mt-5 flex flex-1 flex-col gap-2.5">
              {t.features.map(f=>(
                <li key={f} className="flex gap-2.5 text-sm" style={{ color:t.highlight?'rgba(245,240,230,0.9)':'var(--ink-700)' }}>
                  <span style={{ color:t.highlight?'var(--honey)':'var(--terracotta)' }}>✓</span><span>{f}</span></li>))}
            </ul>
            <button onClick={startPitch}
              className={"mt-6 rounded-full px-5 py-3 text-sm font-medium transition-transform hover:scale-[1.03] "+(t.highlight ? 'bg-cream-50 text-ink-900' : 'bg-ink-900 text-cream-100')}>{t.cta}</button>
          </div>))}
      </div>

      <div className="mt-8 rounded-3xl border border-cream-300 bg-cream-100 p-6">
        <div className="flex items-center gap-3"><NomosMark size={20} color="var(--ink-900)" /><div className="text-sm font-medium text-ink-900">Self-Hosted / Open-Core</div></div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-700">
          Du kannst Telos auch selbst betreiben und mit deinem eigenen Anthropic-Key nutzen. Dann zahlst du nur die KI-Nutzung
          (nutzungsbasiert, typischerweise wenige Cent bis wenige Euro pro Analyse + Antrag) — ohne Abo. Setup in der README.
        </p>
      </div>

      <div className="mt-16"><SectionLabel>HÄUFIGE FRAGEN</SectionLabel>
        <div className="flex flex-col gap-2">
          {FAQ.map((f,i)=><FaqItem key={i} q={f.q} a={f.a} />)}
        </div>
      </div>

      <CTAband startPitch={startPitch} />
    </PageShell>
  );
}

const FAQ = [
  { q: 'Wie verbindlich ist der generierte Antrag?', a: 'Nomos liefert einen strukturierten Entwurf von rund 80 %. Persönliche Angaben, rechtsverbindliche Erklärungen und Unterschriften ergänzt du selbst — mit „[BITTE ERGÄNZEN]" markierte Stellen brauchen deinen Input. Beträge und Förderfähigkeit immer über die offizielle Stelle prüfen.' },
  { q: 'Werden meine Dokumente gespeichert?', a: 'Ohne Konto wird nichts dauerhaft gespeichert — Dokumente werden nur zur Analyse verarbeitet. Übertragung erfolgt TLS-verschlüsselt; Inhalte werden laut Anthropics Geschäftsbedingungen nicht zum Training der KI-Modelle verwendet.' },
  { q: 'Woher kommen die Förderlinien?', a: 'Aus einer kuratierten Datenbank (Bund, Länder, EU) plus optionaler Live-Websuche nach aktuellen Programmen. Quellen werden verlinkt; verbindliche Angaben bitte beim Fördergeber bzw. auf foerderdatenbank.de prüfen.' },
  { q: 'Was kostet die Nutzung?', a: 'Die KI-Nutzung ist nutzungsbasiert — je nach Plan-Länge typischerweise wenige Cent bis wenige Euro pro kompletter Analyse + Antrag. Mit günstigerem Modell (Sonnet) sinken die Kosten weiter.' },
  { q: 'In welcher Sprache arbeitet Nomos?', a: 'Eingabe in lockerem Deutsch (auch per Spracheingabe); die Ausgabe ist präzises Behördendeutsch. Einzelne EU-Programme erwarten englische Anträge — das berücksichtigt Nomos je Förderlinie.' },
];
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-cream-300 bg-cream-50">
      <button onClick={()=>setOpen(o=>!o)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span className="text-sm font-medium text-ink-900">{q}</span>
        <span className="flex-none text-terracotta transition-transform" style={{ transform: open?'rotate(45deg)':'none', fontSize:18, lineHeight:1 }}>+</span>
      </button>
      {open && <p className="anim-fadein px-5 pb-4 text-sm leading-relaxed text-ink-700">{a}</p>}
    </div>
  );
}

/* ── Auth-UI: Modal, Konto-Menü, Verlauf, Profil ──────────────────────────── */
function AuthModal({ open, onClose, auth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'login') await auth.login(email, password);
      else await auth.register(email, password, name);
      onClose();
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }
  return (
    <Modal onClose={onClose} className="max-w-md" label={mode==='login' ? 'Anmelden' : 'Konto erstellen'}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><TelosLockup size={22} /><span className="brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.18em' }}>· KONTO</span></div>
          <button onClick={onClose} aria-label="Schließen" className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-cream-400 text-ink-700 hover:border-ink-900">✕</button>
        </div>
        <h2 className="mt-4 font-sans" style={{ fontSize:24, fontWeight:500, letterSpacing:'-0.02em' }}>{mode==='login' ? 'Anmelden' : 'Konto erstellen'}</h2>
        <p className="mt-1 text-sm text-ink-700">{mode==='login' ? 'Melde dich an, um deinen Verlauf zu sehen.' : 'Speichere Pitches & Anträge in deinem Konto.'}</p>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          {mode==='register' && <input value={name} onChange={e=>setName(e.target.value)} placeholder="Name (optional)" className="w-full rounded-xl border border-cream-300 bg-cream-100 px-4 py-3 text-sm outline-none focus:border-ink-900" />}
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email" placeholder="E-Mail" className="w-full rounded-xl border border-cream-300 bg-cream-100 px-4 py-3 text-sm outline-none focus:border-ink-900" />
          <input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete={mode==='login'?'current-password':'new-password'} placeholder={mode==='login'?'Passwort':'Passwort (min. 8 Zeichen)'} className="w-full rounded-xl border border-cream-300 bg-cream-100 px-4 py-3 text-sm outline-none focus:border-ink-900" />
          {err && <div className="rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-2.5 text-sm text-ink-900">{err}</div>}
          <button disabled={busy} className="mt-1 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-cream-100 transition-transform enabled:hover:scale-[1.02] disabled:opacity-50">{busy ? 'Bitte warten …' : (mode==='login' ? 'Anmelden' : 'Registrieren')}</button>
        </form>
        <div className="mt-4 text-center text-sm text-ink-700">
          {mode==='login' ? 'Noch kein Konto?' : 'Schon registriert?'}{' '}
          <button onClick={()=>{ setErr(''); setMode(mode==='login'?'register':'login'); }} className="font-medium text-terracotta hover:underline">{mode==='login' ? 'Registrieren' : 'Anmelden'}</button>
        </div>
        <p className="mt-4 brand-mono text-ink-300" style={{ fontSize:9, letterSpacing:'0.1em' }}>Daten liegen nur in deinem Konto und sind jederzeit löschbar.</p>
    </Modal>
  );
}

function AccountMenu({ auth, onLogin, go }) {
  const [open, setOpen] = useState(false);
  if (!auth.user) {
    return <button onClick={onLogin} className="hidden text-sm text-ink-700 transition-colors hover:text-ink-900 sm:inline">Anmelden</button>;
  }
  const initial = (auth.user.name || auth.user.email || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="relative">
      <button onClick={()=>setOpen(o=>!o)} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-900 text-sm font-medium text-cream-100">{initial}</button>
      {open && (
        <div className="anim-fadein absolute right-0 mt-2 w-52 rounded-2xl border border-cream-300 bg-cream-50 p-2 shadow-[0_14px_36px_-16px_rgba(40,30,20,0.4)]" onMouseLeave={()=>setOpen(false)}>
          <div className="truncate px-3 py-2 text-sm text-ink-500">{auth.user.email}</div>
          <button onClick={()=>{ go('verlauf'); setOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-900 hover:bg-cream-200">Mein Verlauf</button>
          <button onClick={()=>{ go('profil'); setOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-900 hover:bg-cream-200">Profil</button>
          <button onClick={()=>{ auth.logout(); setOpen(false); go('home'); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-terracotta hover:bg-cream-200">Abmelden</button>
        </div>
      )}
    </div>
  );
}

function Verlauf({ auth, onLogin, openPitch }) {
  const [pitches, setPitches] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!auth.user) return;
    fetch('/api/pitches').then(r=>r.json()).then(d=>setPitches(d.pitches||[])).catch(()=>setErr('Konnte Verlauf nicht laden.'));
  }, [auth.user]);
  return (
    <PageShell>
      <PageHero eyebrow="MEIN VERLAUF" title={<>Deine <em className="brand-serif italic" style={{ fontWeight:400 }}>Pitches</em>.</>} lede="Alle gespeicherten Analysen — jederzeit erneut aufrufbar." />
      {!auth.user
        ? <div className="mt-8 rounded-3xl border border-cream-300 bg-cream-50 p-6"><p className="text-sm text-ink-700">Bitte melde dich an, um deinen Verlauf zu sehen.</p><button onClick={onLogin} className="mt-3 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-cream-100">Anmelden</button></div>
        : err ? <div className="mt-8 text-sm text-ink-700">{err}</div>
        : pitches===null ? <div className="mt-8"><SkeletonRows n={3} /></div>
        : pitches.length===0 ? <div className="mt-8 rounded-3xl border border-cream-300 bg-cream-50 p-6 text-sm text-ink-700">Noch nichts gespeichert. Lade einen Pitch hoch — eingeloggt wird er automatisch hier abgelegt.</div>
        : <div className="mt-8 flex flex-col gap-2.5">{pitches.map(p=>(
            <button key={p.id} onClick={()=>openPitch(p.id)} className="rounded-2xl border border-cream-300 bg-cream-50 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-16px_rgba(40,30,20,0.35)]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-medium text-ink-900">{p.projektname || 'Unbenanntes Vorhaben'}</span>
                <span className="brand-mono text-ink-500" style={{ fontSize:10 }}>{new Date(p.created_at).toLocaleDateString('de-DE')}</span>
              </div>
            </button>))}</div>}
    </PageShell>
  );
}

function Profil({ auth, onLogin }) {
  const [f, setF] = useState({ company:'', region:'', branche:'', stage:'', website:'', founders:'' });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (auth.profile) setF((x)=>({ ...x, ...auth.profile })); }, [auth.profile]);
  async function save() {
    setBusy(true); setSaved(false);
    try {
      const r = await fetch('/api/profile', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(f) });
      const d = await r.json(); if (r.ok) { auth.setProfile(d.profile); setSaved(true); }
    } catch {}
    setBusy(false);
  }
  const field = (key, label, ph) => (
    <div>
      <label className="brand-mono uppercase text-ink-500" style={{ fontSize:10, letterSpacing:'0.12em' }}>{label}</label>
      <input value={f[key]||''} onChange={e=>{ setF(x=>({...x,[key]:e.target.value})); setSaved(false); }} placeholder={ph}
        className="mt-1 w-full rounded-xl border border-cream-300 bg-cream-100 px-4 py-2.5 text-sm outline-none focus:border-ink-900" />
    </div>
  );
  return (
    <PageShell>
      <PageHero eyebrow="PROFIL" title={<>Dein <em className="brand-serif italic" style={{ fontWeight:400 }}>Profil</em>.</>} lede="Diese Angaben helfen Nomos, künftige Analysen besser einzuordnen." />
      {!auth.user
        ? <div className="mt-8 rounded-3xl border border-cream-300 bg-cream-50 p-6"><p className="text-sm text-ink-700">Bitte melde dich an, um dein Profil zu bearbeiten.</p><button onClick={onLogin} className="mt-3 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-cream-100">Anmelden</button></div>
        : <div className="mt-8 grid max-w-2xl gap-4 rounded-3xl border border-cream-300 bg-cream-50 p-6 sm:grid-cols-2">
            {field('company','Firma/Vorhaben','z. B. Telos GmbH')}
            {field('region','Region/Sitz','z. B. Bayern')}
            {field('branche','Branche','z. B. Energie')}
            {field('stage','Phase','z. B. Pre-Seed')}
            {field('website','Website','https://…')}
            {field('founders','Gründer:innen','Namen, Qualifikationen')}
            <div className="sm:col-span-2 flex items-center gap-3">
              <button onClick={save} disabled={busy} className="rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-cream-100 transition-transform enabled:hover:scale-[1.02] disabled:opacity-50">{busy?'Speichert …':'Profil speichern'}</button>
              {saved && <span className="text-sm text-cobalt">✓ gespeichert</span>}
            </div>
          </div>}
    </PageShell>
  );
}

/* ── Businessplan-Generator ──────────────────────────────────────────────── */
function PageBusinessplan({ onUseForMatching }) {
  const [idea, setIdea] = useState('');
  const [plan, setPlan] = useState('');
  const [busy, setBusy] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [refineMsg, setRefineMsg] = useState('');
  const [err, setErr] = useState('');
  const ideaSpeech = useSpeech((t)=>setIdea(p=>(p.trim()? p.trim()+' ':'')+t));
  const html = useMemo(()=>DOMPurify.sanitize(marked.parse(plan||'', { breaks:true })), [plan]);

  async function downloadWord(){
    if (!plan) return;
    setWordBusy(true);
    try {
      const title = extractPlanTitle(plan) || 'Businessplan';
      const res = await fetch('/api/export', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ content: plan, projektname: title }) });
      if (!res.ok) throw new Error('Export fehlgeschlagen');
      downloadBlob(await res.blob(), safeFile(title) + '.docx');
    } catch (e) { setErr(e.message || 'Word-Export fehlgeschlagen'); }
    setWordBusy(false);
  }

  async function stream(url, body, keepOnError) {
    setBusy(true); setErr('');
    try {
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if (!res.ok && res.headers.get('content-type')?.includes('application/json')) { const e = await res.json().catch(()=>({})); throw new Error(e.error || ('Fehler '+res.status)); }
      setPlan('');
      await readStream(res, (c)=>setPlan(p=>p+c));
    } catch (e) { setErr(e.message); if (keepOnError!=null) setPlan(keepOnError); }
    setBusy(false);
  }
  function gen() { if (idea.trim().length>=15) stream('/api/businessplan', { idea: idea.trim() }); }
  function refine() { const m = refineMsg.trim(); if (!m || !plan) return; const prev = plan; setRefineMsg(''); stream('/api/businessplan/refine', { plan: prev, message: m }, prev); }

  return (
    <PageShell>
      <PageHero eyebrow="BUSINESSPLAN-GENERATOR"
        title={<>Aus der Idee zum <em className="brand-serif italic" style={{ fontWeight:400 }}>Plan</em>.</>}
        lede="Noch kein Businessplan? Nomos macht aus deiner Idee einen ersten Entwurf — den du im Dialog verfeinerst und direkt fürs Fördermatching nutzt." />

      <div className="mt-8 rounded-3xl border border-cream-300 bg-cream-50 p-5">
        <Eyebrow>DEINE IDEE</Eyebrow>
        <div className="relative mt-3">
          <textarea value={idea} onChange={e=>setIdea(e.target.value)} rows={4} disabled={busy}
            placeholder="Beschreibe deine Idee in ein paar Sätzen — Problem, Lösung, für wen. (tippen oder diktieren)"
            className="w-full resize-none rounded-xl border border-cream-300 bg-cream-100 px-4 py-3 pr-12 text-sm leading-relaxed outline-none focus:border-ink-900 disabled:opacity-60" />
          {ideaSpeech.supported && (
            <button onClick={ideaSpeech.toggle} className={"absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full transition-colors "+(ideaSpeech.listening?'bg-terracotta text-cream-50':'border border-cream-400 text-ink-700 hover:border-ink-900')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 19v3" /></svg>
            </button>)}
        </div>
        {err && <div className="mt-3 rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-2.5 text-sm text-ink-900">{err}</div>}
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="brand-mono text-ink-500" style={{ fontSize:10 }}>{idea.trim().length>=15 ? 'bereit' : 'min. 15 Zeichen'}</span>
          <button onClick={gen} disabled={busy || idea.trim().length<15} className="rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-cream-100 transition-transform enabled:hover:scale-[1.03] disabled:opacity-40">{plan ? 'Neu generieren' : 'Businessplan erstellen →'}</button>
        </div>
      </div>

      {busy && !plan && <div className="mt-6 flex items-center gap-3 text-ink-500"><span className="spin"><NomosMark size={18} color="var(--ink-500)" /></span><span className="brand-mono" style={{ fontSize:12 }}>Nomos schreibt deinen Businessplan …</span></div>}

      {plan && (
        <>
          <article className="mt-6 rounded-3xl border border-cream-300 bg-cream-50 p-8 md:p-10"><div className="md" dangerouslySetInnerHTML={{ __html: html }} /></article>
          <div className="mt-4 rounded-3xl border border-cream-300 bg-cream-100 p-5">
            <Eyebrow>VERFEINERN (DIALOG)</Eyebrow>
            <p className="mt-1 text-sm text-ink-700">Ergänze Infos oder äußere einen Wunsch — z. B. „Wir sind 2 Gründer mit Studium", „Markt ist B2B", „füge Umsatzprognose hinzu".</p>
            <div className="mt-3 flex items-end gap-2">
              <textarea value={refineMsg} onChange={e=>setRefineMsg(e.target.value)} rows={2} disabled={busy}
                placeholder="Deine Ergänzung … (tippen oder diktieren)"
                className="w-full resize-none rounded-xl border border-cream-300 bg-cream-50 px-4 py-2.5 text-sm outline-none focus:border-ink-900 disabled:opacity-60" />
              <MicButton onText={(t)=>setRefineMsg(p=>(p.trim()? p.trim()+' ':'')+t)} />
              <button onClick={refine} disabled={busy || !refineMsg.trim()} className="flex-none rounded-full bg-ink-900 px-4 py-2.5 text-sm font-medium text-cream-100 transition-transform enabled:hover:scale-[1.03] disabled:opacity-40">{busy ? '…' : 'Verbessern'}</button>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={()=>onUseForMatching(plan)} disabled={busy} className="rounded-full bg-terracotta px-6 py-3 text-sm font-medium text-cream-50 transition-transform enabled:hover:scale-[1.03] disabled:opacity-40">Mit diesem Plan Förderungen finden →</button>
            <button onClick={downloadWord} disabled={busy||wordBusy} className="rounded-full border border-cream-400 px-4 py-3 text-sm text-ink-900 transition-colors enabled:hover:border-ink-900 disabled:opacity-40">{wordBusy?'… Word':'⬇ Word (.docx)'}</button>
            <button onClick={()=>printHtmlAsPdf(html, extractPlanTitle(plan)||'Businessplan')} disabled={busy} className="rounded-full border border-cream-400 px-4 py-3 text-sm text-ink-900 transition-colors enabled:hover:border-ink-900 disabled:opacity-40">⬇ PDF</button>
          </div>
          <span className="mt-2 block brand-mono text-ink-500" style={{ fontSize:10 }}>Der Plan wird direkt analysiert; eingeloggt landet er in deinem Verlauf. „PDF" öffnet die Druckansicht → „Als PDF speichern".</span>
        </>)}

      <p className="mt-6 brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.1em' }}>● ERSTER ENTWURF — „[BITTE ERGÄNZEN]"-STELLEN SELBST PRÜFEN/FÜLLEN</p>
    </PageShell>
  );
}

/* ── Anmelde-Nudge: freundlich, schließbar, nach der ersten Analyse ────────── */
function SignupNudge({ onLogin, onClose }) {
  return (
    <div className="no-print anim-fadeup fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-2xl border border-cream-300 bg-cream-50 p-4 shadow-[0_20px_50px_-20px_rgba(40,30,20,0.5)] md:inset-x-auto md:right-5 md:bottom-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-ink-900"><NomosMark size={18} color="var(--cream-100)" /></div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink-900">Ergebnisse sichern & im Hintergrund weiterarbeiten</div>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">Melde dich kostenlos an, dann landen deine Analyse und Anträge im Verlauf, die Fördersuche läuft beim Navigieren weiter und du kannst jederzeit fortsetzen.</p>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={onLogin} className="rounded-full bg-terracotta px-4 py-2 text-xs font-medium text-cream-50 transition-transform hover:scale-[1.03]">Kostenlos anmelden</button>
            <button onClick={onClose} className="rounded-full px-3 py-2 text-xs text-ink-500 transition-colors hover:text-ink-900">Später</button>
          </div>
        </div>
        <button onClick={onClose} aria-label="Schließen" className="flex-none text-ink-300 transition-colors hover:text-ink-900">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </div>
    </div>
  );
}

/* ── App shell ───────────────────────────────────────────────────────────── */
function App() {
  const [view, setView] = useState('landing');
  const [page, setPage] = useState('home');
  const [proj, setProj] = useState('');
  const [pitch, setPitch] = useState('');
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [pitchId, setPitchId] = useState(null);
  const auth = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  // Matching-Pipeline — liegt in App, läuft daher beim Navigieren weiter und geht nicht verloren.
  const [phase, setPhase] = useState('idle'); // idle|analyzing|ready|error
  const [live, setLive] = useState([]);
  const [searching, setSearching] = useState(false);
  const [liveErr, setLiveErr] = useState('');
  const [nudgeClosed, setNudgeClosed] = useState(() => { try { return localStorage.getItem('nomos_signup_nudge') === '1'; } catch { return false; } });

  async function runLiveSearch(a) {
    if (!a) return;
    setSearching(true); setLiveErr(''); setLive([]);
    try {
      const res = await fetch('/api/livesearch', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ projektname: a.projektname||proj, einzeiler: a.einzeiler, branche: a.branche, phase: a.phase, region: a.region }) });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || ('Fehler '+res.status)); }
      // Progressive NDJSON: pro Zeile ein Treffer — sofort anhängen (dedupliziert).
      let buf = '';
      const handle = (txt) => {
        buf += txt; let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          let obj; try { obj = JSON.parse(line); } catch { continue; }
          if (obj.error) { setLiveErr(obj.error); continue; }
          if (obj.program) setLive(prev => {
            const k = (obj.program.name||'').toLowerCase().trim();
            if (!k || prev.some(p => (p.name||'').toLowerCase().trim() === k)) return prev;
            return [...prev, obj.program];
          });
        }
      };
      await readStream(res, handle);
    } catch (e) { setLiveErr(e.message); }
    setSearching(false);
  }

  async function savePitch(a, pname) {
    if (!auth.user) return;
    try {
      const r = await fetch('/api/pitches', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ projektname: pname, pitch_text: pitch, analysis: a }) });
      const d = await r.json(); if (r.ok) setPitchId(d.id);
    } catch {}
  }

  function finalize(a, pname) {
    setAnalysis(a); setPhase('ready'); setPage('home'); setView('dashboard');
    savePitch(a, pname);
  }

  async function analyze(overrideText, overrideProj) {
    const text = (overrideText != null ? overrideText : pitch).trim();
    const pj = (overrideProj != null ? overrideProj : proj).trim();
    setError(''); setPitchId(null); setLive([]); setLiveErr('');
    setPage('home'); setView('analyze'); setPhase('analyzing');
    try {
      const fd = new FormData();
      if (pj) fd.append('projektname', pj);
      if (text) fd.append('pitch', text);
      if (file && overrideText == null) fd.append('document', file);
      const res = await fetch('/api/analyze', { method:'POST', body: fd });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || `Fehler ${res.status}`); }
      const data = await res.json();
      const pname = pj || data.projektname || '';
      if (!pj && data.projektname) setProj(data.projektname);
      // Ergebnisse SOFORT zeigen — nicht auf Web-Suche oder Rückfragen warten.
      finalize(data, pname);
      // Web-Suche im Hintergrund (Treffer mergen sich live in 'combined').
      // Rückfragen sind optional und laufen on-demand über das FollowupPanel auf dem Dashboard.
      runLiveSearch(data);
    } catch (e) {
      setError(e.message); setPhase('error'); setView('landing');
    }
  }

  function useIdeaPlan(planText) {
    const name = extractPlanTitle(planText) || '';
    setProj(name); setFile(null); setPitch(planText); analyze(planText, name);
  }

  async function openPitch(id) {
    try {
      const r = await fetch('/api/pitches/' + id); const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Konnte Pitch nicht laden');
      const p = d.pitch;
      setProj(p.projektname || ''); setPitch(p.pitch_text || ''); setFile(null);
      setAnalysis(p.analysis || {}); setPitchId(p.id); setSelected(null);
      setLive([]); setSearching(false); setLiveErr(''); setPhase('ready');
      setPage('home'); setView('dashboard');
    } catch (e) { setError(e.message); }
  }

  function reset() { setView('landing'); setSelected(null); setAnalysis(null); setError(''); setPitchId(null); setPhase('idle'); setLive([]); setSearching(false); setLiveErr(''); }
  function go(p) { setPage(p); }
  function startPitch() { setPage('home'); setView('landing'); }
  function requireLogin() { setAuthOpen(true); }
  function closeNudge() { setNudgeClosed(true); try { localStorage.setItem('nomos_signup_nudge', '1'); } catch {} }

  const flowBusy = phase==='analyzing' || searching;
  const flowLabel = phase==='analyzing' ? 'Analyse läuft …' : searching ? 'Web-Suche läuft …' : '';
  function resumeFlow() { setPage('home'); setView(analysis ? 'dashboard' : 'analyze'); }

  useEffect(() => { window.scrollTo({ top:0, behavior:'instant' }); }, [page, view]);

  return (
    <div className="min-h-screen bg-cream-100">
      <Nav page={page} go={go} onLogo={()=>{setPage('home');setView('landing');}} startPitch={startPitch} auth={auth} onLogin={requireLogin}
        flowBusy={flowBusy} flowLabel={flowLabel} onResume={resumeFlow} />
      {page==='verlauf' ? <Verlauf auth={auth} onLogin={requireLogin} openPitch={openPitch} />
        : page==='profil' ? <Profil auth={auth} onLogin={requireLogin} />
        : page==='entdecken' ? <PageExplore startPitch={startPitch} />
        : page==='businessplan' ? <PageBusinessplan onUseForMatching={useIdeaPlan} />
        : page !== 'home'
        ? <Marketing page={page} go={go} startPitch={startPitch} />
        : <>
            {view==='landing'   && <Landing {...{proj,setProj,pitch,setPitch,file,setFile,error,onAnalyze:analyze}} onIdea={()=>go('businessplan')} onVision={()=>go('vision')} onExplore={()=>go('entdecken')} />}
            {view==='analyze'   && <Analyzing proj={proj} />}
            {view==='dashboard' && <Dashboard {...{proj,pitch,file,analysis,live,searching,liveErr}} onReSearch={()=>runLiveSearch(analysis)} onUpdate={(u)=>{ setAnalysis(u); runLiveSearch(u); }} onSelect={(g)=>{setSelected(g);setView('antrag');}} />}
            {view==='antrag'    && <Antrag {...{proj,pitch,file,grant:selected,pitchId,loggedIn:!!auth.user}} onBack={()=>setView('dashboard')} onReset={reset} />}
          </>}
      <Footer go={go} startPitch={startPitch} />
      <AuthModal open={authOpen} onClose={()=>setAuthOpen(false)} auth={auth} />
      {!auth.user && phase==='ready' && !nudgeClosed && <SignupNudge onLogin={requireLogin} onClose={closeNudge} />}
    </div>
  );
}

const NAV_ITEMS = [['Entdecken','entdecken'],['Produkt','produkt'],['Nomos-Engine','engine'],['Preise','preise'],['Vision','vision']];

function Nav({ page, go, onLogo, startPitch, auth, onLogin, flowBusy, flowLabel, onResume }) {
  const [open, setOpen] = useState(false);
  const navTo = (p) => { go(p); setOpen(false); };
  return (
    <header className="glass no-print sticky top-0 z-30 border-b border-cream-300">
      <div className="flex items-center justify-between px-6 py-4 md:px-12">
        <button onClick={()=>{onLogo();setOpen(false);}} className="flex items-center gap-3">
          <TelosLockup size={24} />
          <span className="brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.18em' }}>· NOMOS</span>
        </button>
        <nav className="hidden gap-8 md:flex">
          {NAV_ITEMS.map(([l,p]) => (
            <button key={p} onClick={()=>go(p)}
              className={"text-sm transition-colors "+(page===p ? 'text-ink-900 font-medium' : 'text-ink-700 hover:text-ink-900')}>
              {l}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {flowBusy && flowLabel && (
            <button onClick={onResume} title="Zurück zur laufenden Analyse"
              className="hidden items-center gap-1.5 rounded-full border border-cobalt/40 bg-cobalt/10 px-3 py-1.5 text-cobalt transition-colors hover:bg-cobalt/20 sm:flex">
              <span className="dot-pulse" style={{ fontSize:10 }}>●</span>
              <span className="brand-mono" style={{ fontSize:10, letterSpacing:'0.1em' }}>{flowLabel}</span>
            </button>)}
          <AccountMenu auth={auth} onLogin={onLogin} go={go} />
          <button onClick={startPitch} className="rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-cream-100 transition-transform hover:scale-[1.03]">Pitch hochladen →</button>
          <button onClick={()=>setOpen(o=>!o)} aria-label="Menü" className="flex h-9 w-9 items-center justify-center rounded-full border border-cream-400 text-ink-900 md:hidden">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              {open
                ? <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                : <><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="anim-fadein flex flex-col gap-1 border-t border-cream-300 px-6 py-3 md:hidden">
          {NAV_ITEMS.map(([l,p]) => (
            <button key={p} onClick={()=>navTo(p)}
              className={"rounded-lg px-3 py-2.5 text-left text-sm transition-colors "+(page===p ? 'bg-cream-50 text-ink-900 font-medium' : 'text-ink-700 hover:bg-cream-50')}>
              {l}
            </button>
          ))}
          <div className="my-1 h-px bg-cream-300" />
          {auth.user
            ? <>
                <button onClick={()=>navTo('verlauf')} className="rounded-lg px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-cream-50">Mein Verlauf</button>
                <button onClick={()=>navTo('profil')} className="rounded-lg px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-cream-50">Profil</button>
                <button onClick={()=>{ auth.logout(); navTo('home'); }} className="rounded-lg px-3 py-2.5 text-left text-sm text-terracotta hover:bg-cream-50">Abmelden</button>
              </>
            : <button onClick={()=>{ onLogin(); setOpen(false); }} className="rounded-lg px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-cream-50">Anmelden</button>}
        </nav>
      )}
    </header>
  );
}

/* ── Landing ─────────────────────────────────────────────────────────────── */
function Landing({ proj, setProj, pitch, setPitch, file, setFile, error, onAnalyze, onIdea, onVision, onExplore }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const model = useModel();
  const speech = useSpeech((t) => setPitch(p => (p ? p.trim() + ' ' : '') + t));
  const canGo = pitch.trim().length > 24 || !!file;

  function onDrop(e){ e.preventDefault(); setDrag(false); const f=e.dataTransfer.files?.[0]; if(f) setFile(f); }

  return (
    <main className="anim-fadein relative mx-auto max-w-7xl px-6 pb-24 pt-12 md:px-12">
      <div className="hero-aura" aria-hidden="true" />
      <div className="relative z-10 grid items-start gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <NomosBadge />
            <button onClick={onVision} className="brand-mono text-ink-500 transition-colors hover:text-ink-900" style={{ fontSize:10, letterSpacing:'0.14em' }}>· DAS ERSTE PRODUKT VON TELOS → VISION</button>
          </div>
          <h1 className="mt-6 font-sans" style={{ fontSize:'clamp(46px,7vw,82px)', fontWeight:400, letterSpacing:'-0.04em', lineHeight:0.94 }}>
            Vom Pitch<br/>zum <em className="brand-serif grad-text italic" style={{ fontWeight:400 }}>Bescheid</em>.<br/>Reibungslos.
          </h1>
          <p className="mt-5 font-sans text-ink-900" style={{ fontSize:'clamp(20px,2.6vw,28px)', fontWeight:400, letterSpacing:'-0.02em' }}>
            Telos macht Gründen <RotatingWord words={VISION_WORDS} />.
          </p>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-700">
            Lade deinen echten Businessplan hoch. Nomos analysiert ihn mit KI, findet passende
            Förderlinien und schreibt 80&nbsp;% des Antrags in formellem Behördendeutsch.
          </p>
          <div className="shadow-card anim-pop mt-9 rounded-3xl border border-cream-300 bg-cream-50/90 p-5">
            <div className="mb-3 flex items-start gap-2 rounded-xl bg-cream-200 px-3 py-2">
              <NomosMark size={15} color="var(--ink-900)" />
              <p className="text-xs leading-relaxed text-ink-700">Nomos sucht auf Basis deiner Idee / deines Businessplans passende Förderungen für dich.</p>
            </div>
            <Eyebrow>SCHRITT 1 · DEIN VORHABEN</Eyebrow>
            <input value={proj} onChange={e=>setProj(e.target.value)} placeholder="Projektname (optional — Nomos erkennt ihn sonst)"
              className="mt-3 w-full rounded-xl border border-cream-300 bg-cream-100 px-4 py-3 text-sm font-medium outline-none transition-colors placeholder:text-ink-300 focus:border-ink-900" />

            {/* dropzone */}
            <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={onDrop}
              onClick={()=>inputRef.current?.click()}
              className={"mt-3 cursor-pointer rounded-xl border border-dashed px-4 py-4 text-center text-sm transition-colors "+(drag?'border-ink-900 bg-cream-200':'border-cream-400 hover:border-ink-700')}>
              <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,application/pdf" className="hidden"
                onChange={e=>setFile(e.target.files?.[0]||null)} />
              {file
                ? <span className="text-ink-900">{file.name} · <button onClick={(e)=>{e.stopPropagation();setFile(null);}} className="text-terracotta underline">entfernen</button></span>
                : <span className="text-ink-500">Pitch-Deck / Businessplan als <strong className="text-ink-700">PDF, DOCX oder TXT</strong> hierher ziehen oder klicken</span>}
            </div>

            <div className="relative mt-3">
              <textarea value={pitch} onChange={e=>setPitch(e.target.value)} rows={4}
                placeholder="… oder beschreibe deine Idee als Text (auch in lockerem Gründer-Slang)."
                className="w-full resize-none rounded-xl border border-cream-300 bg-cream-100 px-4 py-3 pr-12 text-sm leading-relaxed outline-none transition-colors placeholder:text-ink-300 focus:border-ink-900" />
              {speech.supported && (
                <button onClick={speech.toggle} title={speech.listening ? 'Aufnahme stoppen' : 'Per Sprache diktieren'} aria-label={speech.listening ? 'Aufnahme stoppen' : 'Per Sprache diktieren'}
                  className={"absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full transition-colors "+(speech.listening ? 'bg-terracotta text-cream-50' : 'border border-cream-400 text-ink-700 hover:border-ink-900')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
                  </svg>
                  {speech.listening && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-honey dot-pulse" />}
                </button>
              )}
            </div>
            {speech.listening && <p className="mt-1.5 brand-mono text-terracotta" style={{ fontSize:10, letterSpacing:'0.1em' }}>● HÖRT ZU … sprich deine Idee ein</p>}

            <p className="mt-2 text-xs leading-relaxed text-ink-500">🔒 Ohne Konto wird nichts gespeichert. Mit Konto werden Analyse & Eingaben nur in deinem Konto abgelegt (jederzeit löschbar); hochgeladene Dateien werden nicht dauerhaft gespeichert.</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.12em' }}>BEISPIELE:</span>
              {SAMPLES.map(s => <button key={s.proj} onClick={()=>{setProj(s.proj);setPitch(s.text);setFile(null);}}
                className="rounded-full border border-cream-400 px-3 py-1 text-xs text-ink-700 transition-colors hover:border-ink-900 hover:text-ink-900">{s.proj}</button>)}
            </div>

            {error && <div className="mt-4 rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-sm text-ink-900">{error}</div>}

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="brand-mono text-ink-500" style={{ fontSize:10 }}>{canGo ? 'bereit' : 'Text (min. 25 Z.) oder Datei'}</span>
              <button onClick={()=>onAnalyze()} disabled={!canGo}
                className="rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-cream-100 shadow-card transition-all duration-300 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_18px_40px_-18px_rgba(40,30,20,0.6)] enabled:hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-30"
                style={{ transitionTimingFunction:'var(--spring)' }}>
                Mit Nomos analysieren →
              </button>
            </div>
            <div className="mt-3 border-t border-cream-300 pt-3 text-center">
              <span className="text-sm text-ink-700">Noch keinen Businessplan? </span>
              <button onClick={onIdea} className="text-sm font-medium text-terracotta hover:underline">Aus deiner Idee einen erstellen →</button>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap gap-8 border-t border-cream-300 pt-6">
            {[['Echte KI',model+' · serverseitig'],['PDF & DOCX','native Dokument-Analyse'],['80 %','des Antrags vorbereitet']].map(([v,l])=>(
              <div key={l}><div className="font-sans" style={{ fontSize:20, fontWeight:500, letterSpacing:'-0.02em' }}>{v}</div>
                <div className="brand-mono mt-1 uppercase text-ink-500" style={{ fontSize:10, letterSpacing:'0.12em' }}>{l}</div></div>))}
          </div>
        </div>

        {/* explainer card */}
        <div className="rounded-3xl border border-cream-300 bg-cream-50 p-6 lg:sticky lg:top-24">
          <span className="brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.16em' }}>SO ARBEITET NOMOS</span>
          <div className="mt-5 flex flex-col gap-4">
            {[['01','Plan einlesen','Nomos liest dein PDF/DOCX oder deinen Text und extrahiert das Vorhaben.'],
              ['02','Hyperlokal matchen','Abgleich mit kuratierten Förderlinien aus Bund, Ländern und EU — mit Konfidenz und Begründung.'],
              ['03','Übersetzen','Gründer-Slang → präzises Behördendeutsch, ohne neue Fakten zu erfinden.'],
              ['04','Antrag generieren','80 % des offiziellen Antrags als strukturierter Entwurf — exportierbar.']].map(([n,t,d])=>(
              <div key={n} className="flex gap-4">
                <span className="brand-mono text-terracotta" style={{ fontSize:11, letterSpacing:'0.14em' }}>{n}</span>
                <div><div className="text-sm font-medium text-ink-900">{t}</div><div className="mt-1 text-sm leading-relaxed text-ink-700">{d}</div></div>
              </div>))}
          </div>
          <div className="mt-6 flex items-center justify-center"><ArcMark size={36} color="var(--terracotta)" /></div>
          <p className="mt-3 text-center brand-serif italic text-ink-700" style={{ fontSize:16 }}>From Vision to Grant. Seamlessly.</p>
        </div>
        <button onClick={onVision} className="group mt-4 w-full rounded-3xl border border-cream-300 bg-cream-50 p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-20px_rgba(40,30,20,0.4)]">
          <div className="flex items-center justify-between">
            <span className="brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.16em' }}>EINE FAMILIE FÜR DIE GANZE GRÜNDUNG</span>
            <span className="brand-mono text-ink-500 transition-transform group-hover:translate-x-0.5" style={{ fontSize:10, letterSpacing:'0.14em' }}>VISION →</span>
          </div>
          <div className="mt-4 flex items-center justify-between gap-1">
            {PRODUCTS.map((p)=>(
              <div key={p.name} className="flex flex-1 flex-col items-center gap-1.5 transition-transform group-hover:-translate-y-0.5">
                <p.Glyph size={26} color={p.status==='live' ? 'var(--ink-900)' : p.color} />
                <span className="font-sans" style={{ fontSize:11, fontWeight:500, letterSpacing:'-0.03em', color: p.status==='live' ? 'var(--ink-900)' : 'var(--ink-500)' }}>{p.name.toLowerCase()}</span>
                <span className="brand-mono rounded-full px-1.5 py-px" style={{ fontSize:7, letterSpacing:'0.08em', background: p.status==='live' ? 'var(--ink-900)' : p.color+'22', color: p.status==='live' ? '#F7F2E7' : p.color }}>{p.status==='live' ? 'LIVE' : 'BALD'}</span>
              </div>))}
          </div>
        </button>
      </div>

      {/* Entdecken-Teaser */}
      <div className="mt-12 rounded-3xl border border-cream-300 bg-cream-50 p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>KEIN PLAN ZUR HAND? · ENTDECKEN</Eyebrow>
            <h3 className="mt-2 font-sans" style={{ fontSize:24, fontWeight:500, letterSpacing:'-0.03em' }}>Aktuelle Förderungen nach Thema</h3>
          </div>
          <button onClick={onExplore} className="rounded-full border border-ink-900 px-4 py-2 text-sm text-ink-900 transition-colors hover:bg-ink-900 hover:text-cream-100">Alle entdecken →</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[['Top für Gründer','top'],['KI & Deep Tech','ki'],['Nachhaltigkeit & Klima','nachhaltigkeit'],['Digitalisierung','digitalisierung'],['EU-Programme','eu']].map(([l])=>(
            <button key={l} onClick={onExplore}
              className="rounded-full border border-cream-400 px-3.5 py-1.5 text-xs text-ink-700 transition-colors hover:border-ink-900 hover:text-ink-900">{l}</button>))}
        </div>
      </div>
    </main>
  );
}

/* ── Analyzing overlay ──────────────────────────────────────────────────── */
const STEPS = ['Dokument wird eingelesen …','Vorhaben & Merkmale werden extrahiert …','Förderlinien (Bund · Land · EU) werden abgeglichen …','Konfidenz-Scoring der Treffer …','Ergebnisse werden zusammengestellt …'];
const FACTS = [
  'Förderung gibt es auf drei Ebenen: Bund, Länder und EU.',
  'Viele Programme verlangen die Antragstellung VOR Projektbeginn.',
  'Behördendeutsch bevorzugt Nominalstil und überprüfbare Aussagen statt Marketing.',
  'Je konkreter Region, Phase und Technologie im Plan stehen, desto präziser das Matching.',
  'Nomos bewertet Eignung an harten Kriterien — Fokus, Phase, Region.',
  'Ein starker Antrag trennt wirtschaftliche und wissenschaftliche Verwertung.',
];
function Analyzing({ proj }) {
  const [step, setStep] = useState(0);
  const [fact, setFact] = useState(0);
  useEffect(() => { const id = setInterval(()=>setStep(s=>Math.min(s+1, STEPS.length-1)), 2600); return ()=>clearInterval(id); }, []);
  useEffect(() => { const id = setInterval(()=>setFact(f=>(f+1)%FACTS.length), 3600); return ()=>clearInterval(id); }, []);

  return (
    <main className="anim-fadein relative mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
      <div className="floaty relative z-10 flex h-28 w-28 items-center justify-center rounded-3xl bg-ink-900 shadow-card">
        <div className="scan-line" /><div className="spin"><NomosMark size={56} color="var(--cream-100)" /></div>
      </div>
      <Eyebrow className="mt-8">NOMOS · ENGINE</Eyebrow>
      <h2 className="mt-2 font-sans" style={{ fontSize:32, fontWeight:500, letterSpacing:'-0.03em' }}>Analysiere „{proj || 'dein Vorhaben'}“ …</h2>
      <div className="mt-8 grid w-full max-w-2xl gap-5 text-left md:grid-cols-2">
        <div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-cream-300"><div className="indet" /></div>
          <div className="mt-5 flex flex-col gap-2.5">
            {STEPS.map((s,i)=>(
              <div key={i} className="flex items-center gap-3 transition-opacity" style={{ opacity:i<=step?1:0.3 }}>
                <span className="brand-mono" style={{ fontSize:12, color:i<step?'var(--terracotta)':'var(--ink-500)' }}>{i<step?'✓':(i===step?<span className="dot-pulse">●</span>:'○')}</span>
                <span className="brand-mono text-ink-700" style={{ fontSize:12 }}>{s}</span>
              </div>))}
          </div>
        </div>
        {/* Wusstest du? — fesselt während der Analyse */}
        <div className="flex flex-col justify-center rounded-2xl border border-cream-300 bg-cream-50 p-5">
          <div className="flex items-center gap-2"><ArcMark size={20} color="var(--terracotta)" /><Eyebrow>WUSSTEST DU?</Eyebrow></div>
          <p key={fact} className="anim-fadein mt-3 text-sm leading-relaxed text-ink-900" style={{ minHeight:60 }}>{FACTS[fact]}</p>
          <div className="mt-3 flex gap-1">{FACTS.map((_,i)=><span key={i} className="h-1 rounded-full transition-all" style={{ width:i===fact?16:6, background:i===fact?'var(--terracotta)':'var(--cream-300)' }} />)}</div>
        </div>
      </div>
      <div className="mt-8 w-full max-w-2xl text-left">
        <Eyebrow className="mb-3">TREFFER WERDEN VORBEREITET</Eyebrow>
        <SkeletonRows n={3} />
      </div>
      <p className="mt-6 text-sm text-ink-500">Echte KI-Analyse — das dauert je nach Plan einige Sekunden.</p>
    </main>
  );
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */
// Gezielte KI-Rückfragen → Antworten → Re-Scoring der Treffer.
function FollowupPanel({ analysis, onUpdate }) {
  const [phase, setPhase] = useState('idle'); // idle|loading|asking|empty|rescoring|done|error
  const [qs, setQs] = useState([]);
  const [answers, setAnswers] = useState({});
  const [err, setErr] = useState('');

  async function load() {
    setPhase('loading'); setErr('');
    try {
      const res = await fetch('/api/followup', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ analysis }) });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || ('Fehler '+res.status)); }
      const d = await res.json();
      if (!d.questions || !d.questions.length) { setPhase('empty'); return; }
      setQs(d.questions); setAnswers({}); setPhase('asking');
    } catch (e) { setErr(e.message); setPhase('error'); }
  }
  async function submit() {
    const ans = qs.map((q,i)=>({ frage:q.frage, antwort:(answers[i]||'').trim() })).filter(a=>a.antwort);
    if (!ans.length) return;
    setPhase('rescoring'); setErr('');
    try {
      const res = await fetch('/api/rescore', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ analysis, answers: ans }) });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || ('Fehler '+res.status)); }
      const updated = await res.json();
      onUpdate(updated); setPhase('done');
    } catch (e) { setErr(e.message); setPhase('error'); }
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>SCHRITT 2b · TREFFER VERFEINERN (KI-RÜCKFRAGEN)</Eyebrow>
        {(phase==='idle'||phase==='empty'||phase==='done'||phase==='error') &&
          <button onClick={load} className="rounded-full border border-terracotta px-4 py-2 text-xs text-ink-900 transition-colors hover:bg-terracotta hover:text-cream-50">
            {phase==='idle' ? 'Offene Rückfragen prüfen' : 'Erneut prüfen'}
          </button>}
      </div>

      {phase==='idle' && <p className="text-sm leading-relaxed text-ink-700">Fehlen im Plan Angaben, die für einzelne Förderlinien entscheidend sind (z. B. Studienabschluss, Sitz, KMU-Status)? Nomos stellt gezielte Rückfragen und passt danach den Score an.</p>}
      {phase==='loading' && <div><p className="mb-2.5 text-sm text-ink-500">Nomos prüft offene Punkte …</p><SkeletonRows n={2} /></div>}
      {phase==='empty' && <div className="rounded-2xl border border-cream-300 bg-cream-50 p-4 text-sm text-ink-700">Keine wesentlichen Rückfragen — das Matching ist mit den vorhandenen Angaben eindeutig.</div>}
      {err && <div className="rounded-2xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-sm text-ink-900">{err}</div>}

      {(phase==='asking'||phase==='rescoring') && (
        <div className="rounded-3xl border border-cream-300 bg-cream-50 p-5">
          <div className="flex flex-col gap-4">
            {qs.map((q,i)=>(
              <div key={i}>
                <div className="text-sm font-medium text-ink-900">{q.frage}</div>
                <div className="brand-mono mt-0.5 text-ink-500" style={{ fontSize:10, letterSpacing:'0.06em' }}>WARUM: {q.warum}</div>
                <div className="mt-2 flex items-center gap-2">
                  <input value={answers[i]||''} onChange={e=>setAnswers(a=>({...a,[i]:e.target.value}))} disabled={phase==='rescoring'}
                    placeholder="Deine Antwort … (tippen oder diktieren)"
                    className="w-full rounded-xl border border-cream-300 bg-cream-100 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-ink-300 focus:border-ink-900 disabled:opacity-60" />
                  <MicButton onText={(t)=>setAnswers(a=>({...a,[i]:((a[i]||'').trim()? a[i].trim()+' ':'')+t}))} />
                </div>
              </div>))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={submit} disabled={phase==='rescoring'}
              className="rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-cream-100 transition-transform enabled:hover:scale-[1.03] disabled:opacity-40">
              {phase==='rescoring' ? 'Verfeinere …' : 'Verfeinern & neu suchen →'}
            </button>
            {phase==='rescoring' && <span className="spin"><NomosMark size={16} color="var(--terracotta)" /></span>}
          </div>
        </div>)}

      {phase==='done' && <div className="rounded-2xl border border-cobalt/40 bg-cobalt/10 px-4 py-3 text-sm text-ink-900">✓ Profil verfeinert — Nomos sucht oben passende Förderungen neu.</div>}
    </div>
  );
}

/* ── Entdecken: aktuelle Förderungen nach Kategorie ───────────────────────── */
function PageExplore({ startPitch }) {
  const [cats, setCats] = useState([]);
  const [active, setActive] = useState(null);
  const [progs, setProgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);
  const cache = useRef({});

  useEffect(() => {
    fetch('/api/explore/categories').then(r=>r.json()).then(d=>{
      const list = d.categories || []; setCats(list);
      if (list.length) load(list[0].key);
    }).catch(()=>setErr('Kategorien konnten nicht geladen werden.'));
  }, []);

  async function load(key){
    setActive(key); setErr('');
    if (cache.current[key]) { setProgs(cache.current[key]); return; }
    setBusy(true); setProgs([]);
    try {
      const r = await fetch('/api/explore?category='+encodeURIComponent(key));
      const d = await r.json(); if (!r.ok) throw new Error(d.error || ('Fehler '+r.status));
      cache.current[key] = d.programs || []; setProgs(d.programs || []);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <main className="anim-fadein mx-auto max-w-5xl px-6 pb-24 pt-10 md:px-12">
      <Eyebrow>NOMOS · ENTDECKEN</Eyebrow>
      <h1 className="mt-2 font-sans" style={{ fontSize:'clamp(30px,4.5vw,46px)', fontWeight:500, letterSpacing:'-0.03em', lineHeight:1.02 }}>Aktuelle Förderungen,<br/>nach <span className="grad-text">Thema</span> sortiert.</h1>
      <p className="mt-3 max-w-xl text-ink-700">Frisch aus dem Web recherchiert und auf Beantragbarkeit geprüft. Wähle eine Kategorie — oder lade oben deinen Businessplan hoch für ein passgenaues Matching.</p>

      <div className="no-scrollbar mt-7 flex gap-2 overflow-x-auto pb-1">
        {cats.map(c => (
          <button key={c.key} onClick={()=>load(c.key)}
            className={"whitespace-nowrap rounded-full border px-4 py-2 text-sm transition-all "+(active===c.key ? 'border-ink-900 bg-ink-900 text-cream-100' : 'border-cream-400 text-ink-700 hover:border-ink-900 hover:text-ink-900')}>
            {c.label}
          </button>))}
      </div>

      <div className="mt-6">
        {err && <p className="brand-mono text-terracotta" style={{ fontSize:11 }}>{err}</p>}
        {busy
          ? <SearchingRows have={0} />
          : progs.length
            ? <div className="grid gap-2.5 md:grid-cols-2">
                {progs.map((g,i)=><MatchRow key={(g.id||g.name)+'-'+i} g={g} delay={i*40} ctaLabel="Details ansehen →" onSelect={()=>setDetail(g)} />)}
              </div>
            : !err && <p className="text-sm text-ink-500">Keine aktuell beantragbaren Programme gefunden.</p>}
      </div>

      {detail && <GrantDetail grant={detail} onClose={()=>setDetail(null)} startPitch={startPitch} />}
    </main>
  );
}

function Dashboard({ proj, pitch, file, analysis, live, searching, liveErr, onReSearch, onUpdate, onSelect }) {
  const a = analysis || {};
  const sourceText = pitch.trim() || a.einzeiler || '';
  const [translated, setTranslated] = useState('');
  const [translating, setTranslating] = useState(false);
  // Web-getrieben: nur Live-Treffer anzeigen. Kuratierte DB nur als stiller Fallback,
  // wenn die Web-Suche abgeschlossen ist und nichts geliefert hat.
  const dedupeSort = (list) => {
    const seen = new Set(); const out = [];
    for (const g of list) {
      if (g.antragMoeglich === false) continue;
      const k = (g.name || '').toLowerCase().trim();
      if (!k || seen.has(k)) continue; seen.add(k); out.push(g);
    }
    return out.sort((x, y) => (y.fit || 0) - (x.fit || 0));
  };
  const webResults = useMemo(() => dedupeSort(live || []), [live]);
  const usingFallback = !searching && webResults.length === 0 && (a.matches || []).length > 0;
  const combined = usingFallback ? dedupeSort(a.matches || []) : webResults;

  async function translate() {
    if (!sourceText) return;
    setTranslating(true); setTranslated('');
    try {
      const res = await fetch('/api/translate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: sourceText }) });
      if (!res.ok) { const e = await res.json().catch(()=>({})); setTranslated('[Fehler: '+(e.error || ('Status '+res.status))+']'); setTranslating(false); return; }
      await readStream(res, (chunk)=>setTranslated(t=>t+chunk));
    } catch (e) { setTranslated('[Fehler: '+e.message+']'); }
    setTranslating(false);
  }

  return (
    <main className="anim-fadein mx-auto max-w-5xl px-6 pb-24 pt-8 md:px-12">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="brand-mono uppercase text-ink-500" style={{ fontSize:10, letterSpacing:'0.14em' }}>NOMOS-ANALYSE{file?` · ${file.name}`:''}</span>
          <h2 className="mt-1 font-sans" style={{ fontSize:30, fontWeight:500, letterSpacing:'-0.03em' }}>{a.projektname || proj || 'Dein Vorhaben'}</h2>
          {a.einzeiler && <p className="mt-2 max-w-2xl text-ink-700">{a.einzeiler}</p>}
        </div>
        <span className="brand-mono flex items-center gap-1.5 text-terracotta" style={{ fontSize:10 }}><span className="dot-pulse">●</span> {combined.length} TREFFER{searching && ' …'}</span>
      </div>

      {/* meta + staerken/luecken */}
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <MetaCard label="BRANCHE" value={a.branche} />
        <MetaCard label="PHASE" value={a.phase} />
        <MetaCard label="REGION" value={a.region} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ListCard title="FÖRDERRELEVANTE STÄRKEN" items={a.staerken} color="var(--cobalt)" />
        <ListCard title="MÖGLICHE LÜCKEN" items={a.luecken} color="var(--terracotta)" />
      </div>

      {/* matches — web-getrieben, progressiv */}
      <div className="mt-6">
        <span className="sr-only" aria-live="polite" role="status">
          {searching ? `Suche läuft … ${combined.length} Förderungen bisher gefunden.` : `${combined.length} Förderungen gefunden.`}
        </span>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Eyebrow>SCHRITT 2 · AKTUELLE FÖRDERUNGEN · LIVE AUS DEM WEB</Eyebrow>
          <span className="brand-mono flex items-center gap-1.5 text-cobalt" style={{ fontSize:10, letterSpacing:'0.1em' }}>
            {searching ? <><span className="spin"><NomosMark size={12} color="var(--cobalt)" /></span> WEB-SUCHE LÄUFT …</>
              : <button onClick={onReSearch} className="hover:underline">↻ ERNEUT IM WEB SUCHEN</button>}
          </span>
        </div>
        {combined.length===0 && !searching
          ? <div className="rounded-2xl border border-cream-300 bg-cream-50 p-5 text-sm text-ink-700">Keine aktuell beantragbaren Förderungen gefunden. Ergänze deinen Plan um Region, Phase und Technologiefeld und suche erneut.</div>
          : <div className="flex flex-col gap-2.5">
              {combined.map((g,i)=><MatchRow key={(g.id||g.name||'')+'-'+g.fit} g={g} delay={i*40} onSelect={()=>onSelect(g)} />)}
              {searching && <SearchingRows have={combined.length} />}
            </div>}
        {usingFallback && <p className="mt-2 brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.1em' }}>● WEB-SUCHE OHNE TREFFER{liveErr?` (${liveErr})`:''} — ERSATZWEISE PASSENDE PROGRAMME AUS DER NOMOS-DATENBANK.</p>}
        {!usingFallback && combined.length>0 && <p className="mt-2 brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.1em' }}>● LIVE AUS DEM WEB — QUELLEN VOR ANTRAGSTELLUNG PRÜFEN</p>}
      </div>

      {/* Rückfragen / Verfeinerung */}
      {combined.length>0 && <FollowupPanel analysis={analysis} onUpdate={onUpdate} />}

      {/* translation */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <Eyebrow>SCHRITT 3 · NOMOS-ÜBERSETZUNG</Eyebrow>
          <button onClick={translate} disabled={!sourceText||translating}
            className="rounded-full border border-cream-400 px-4 py-2 text-xs text-ink-900 transition-colors enabled:hover:border-ink-900 disabled:opacity-40">
            {translating ? 'übersetzt …' : 'In Behördendeutsch übersetzen'}
          </button>
        </div>
        <div className="grid items-stretch gap-3 md:grid-cols-[1fr_48px_1fr]">
          <Panel label="ORIGINAL"><span className="text-sm leading-relaxed text-ink-900">{sourceText || '—'}</span></Panel>
          <div className="flex items-center justify-center"><ArcMark size={32} color="var(--terracotta)" /></div>
          <Panel label="NOMOS · BEHÖRDEN-FASSUNG" dark>
            <span className="text-sm leading-relaxed">{translated || <span className="text-cream-300">Klicke „übersetzen“, um die formelle Fassung zu erzeugen.</span>}</span>
          </Panel>
        </div>
      </div>
    </main>
  );
}

const MetaCard = ({ label, value }) => (
  <div className="rounded-2xl border border-cream-300 bg-cream-50 p-4">
    <div className="brand-mono uppercase text-ink-500" style={{ fontSize:10, letterSpacing:'0.14em' }}>{label}</div>
    <div className="mt-1 text-sm font-medium text-ink-900">{value || '—'}</div>
  </div>);

const ListCard = ({ title, items, color }) => (
  <div className="rounded-2xl border border-cream-300 bg-cream-50 p-4">
    <div className="brand-mono uppercase text-ink-500" style={{ fontSize:10, letterSpacing:'0.14em' }}>{title}</div>
    <ul className="mt-2 flex flex-col gap-1.5">
      {(items&&items.length?items:['—']).map((it,i)=>(
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-700">
          <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full" style={{ background:color }} /><span>{it}</span></li>))}
    </ul></div>);

function fitColor(fit) { return fit >= 80 ? 'var(--terracotta)' : fit >= 65 ? 'var(--honey)' : 'var(--cobalt)'; }
function fitLabel(fit) { return fit >= 80 ? 'Starke Passung' : fit >= 65 ? 'Gute Passung' : 'Mögliche Passung'; }

// Animierter Score-Ring (füllt sich beim Erscheinen).
function ScoreRing({ value, color, size = 60 }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  const [v, setV] = useState(0);
  const gid = useMemo(() => 'sg' + Math.random().toString(36).slice(2, 8), []);
  useEffect(() => { const t = setTimeout(() => setV(value), 60); return () => clearTimeout(t); }, [value]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-none">
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor="var(--honey)" />
        </linearGradient>
        <filter id={gid+'g'} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" result="b" /><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--cream-300)" strokeWidth="6" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c*(1 - Math.max(0,Math.min(100,v))/100)} filter={`url(#${gid}g)`}
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition:'stroke-dashoffset 1.1s cubic-bezier(.2,.7,.3,1)' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="brand-mono"
        style={{ fontSize:15, fontWeight:600, fill:'var(--ink-900)' }}>{value}</text>
    </svg>
  );
}

function MatchRow({ g, delay, onSelect, ctaLabel='Antrag erstellen →' }) {
  const col = fitColor(g.fit);
  return (
    <div className="lift shadow-card anim-fadeup group rounded-2xl border border-cream-200 bg-cream-50 p-4"
      style={{ animationDelay:`${delay}ms`, borderLeft:`3px solid ${col}` }}>
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center gap-1">
          <ScoreRing value={g.fit} color={col} />
          <span className="brand-mono uppercase" style={{ fontSize:8, letterSpacing:'0.12em', color:col }}>{fitLabel(g.fit)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {g.live && <span className="brand-mono rounded-full bg-cobalt px-2 py-0.5 text-cream-50" style={{ fontSize:9, letterSpacing:'0.12em' }}>● LIVE</span>}
            <span className="text-[15px] font-medium text-ink-900">{g.name}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="brand-mono rounded-full bg-cream-200 px-2 py-0.5 text-ink-700" style={{ fontSize:9, letterSpacing:'0.06em' }}>{g.region}</span>
            <span className="brand-mono rounded-full bg-cream-200 px-2 py-0.5 text-ink-700" style={{ fontSize:9, letterSpacing:'0.06em' }}>{g.amount}</span>
            {g.fundingRate && <span className="brand-mono rounded-full bg-cream-200 px-2 py-0.5 text-ink-700" style={{ fontSize:9, letterSpacing:'0.06em' }}>{g.fundingRate}</span>}
            {g.frist && g.frist!=='k.A.' && <span className="brand-mono rounded-full bg-cobalt/10 px-2 py-0.5 text-cobalt" style={{ fontSize:9, letterSpacing:'0.06em' }}>⏱ {g.frist}</span>}
          </div>
          {g.summary && <p className="mt-2 text-sm leading-relaxed text-ink-700">{g.summary}</p>}
          <p className="mt-1.5 text-sm leading-relaxed text-ink-900"><span className="brand-mono text-ink-500" style={{ fontSize:9, letterSpacing:'0.1em' }}>WARUM: </span>{g.begruendung}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={onSelect} className="rounded-full bg-ink-900 px-4 py-2 text-xs font-medium text-cream-100 transition-transform hover:scale-[1.04]">{ctaLabel}</button>
            {g.url && <a href={g.url} target="_blank" rel="noopener noreferrer" className="brand-mono text-cobalt hover:underline" style={{ fontSize:10, letterSpacing:'0.08em' }}>Zur Förderung ↗</a>}
          </div>
        </div>
      </div>
    </div>);
}

// Lade-Platzhalter im Layout von MatchRow.
function SkeletonRow() {
  const bar = (w) => <div className="shimmer h-3 rounded" style={{ width:w }} />;
  return (
    <div className="rounded-xl border border-cream-200 bg-cream-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {bar('55%')}
          <div className="mt-2">{bar('38%')}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1 w-20 rounded-full bg-cream-300" />
          <div className="h-8 w-20 rounded-full bg-cream-300" />
        </div>
      </div>
      <div className="mt-3">{bar('90%')}</div>
      <div className="mt-2">{bar('72%')}</div>
    </div>
  );
}
const SkeletonRows = ({ n=3 }) => <div className="flex flex-col gap-2.5">{Array.from({length:n}).map((_,i)=><SkeletonRow key={i} />)}</div>;

// Lebendiger Lade-Zustand der Web-Suche: wechselnde Quellen-Mikrocopy + Shimmer-Reihen.
const SEARCH_SOURCES = ['Förderdatenbank des Bundes','Landesförderbanken','EU-Programme (Horizon · EIC)','Ministerien & Förderbanken','aktuelle Fristen & Einreichrunden'];
function SearchingRows({ have=0 }) {
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(()=>setI(v=>(v+1)%SEARCH_SOURCES.length), 1600); return ()=>clearInterval(id); }, []);
  return (
    <div className={have>0 ? 'mt-1' : ''}>
      <div className="flex items-center gap-2.5 rounded-xl border border-cobalt/30 bg-cobalt/5 px-4 py-3">
        <span className="spin"><NomosMark size={15} color="var(--cobalt)" /></span>
        <span className="brand-mono text-cobalt" style={{ fontSize:11, letterSpacing:'0.04em' }}>
          {have>0 ? 'sucht weiter …' : 'durchsucht'} <span key={i} className="anim-fadein text-ink-700">{SEARCH_SOURCES[i]}</span>
        </span>
      </div>
      {have===0 && <div className="mt-2.5"><SkeletonRows n={3} /></div>}
    </div>
  );
}

function Panel({ label, dark, children }) {
  return (
    <div className={"rounded-2xl p-4 "+(dark?"bg-ink-900 text-cream-100":"border border-cream-300 bg-cream-50 text-ink-900")}>
      <div className="brand-mono mb-2" style={{ fontSize:10, letterSpacing:'0.14em', color:dark?'rgba(245,240,230,0.55)':'var(--ink-500)' }}>{label}</div>
      {children}
    </div>);
}

/* ── Antrag (streaming) ─────────────────────────────────────────────────── */
function Antrag({ proj, pitch, file, grant, pitchId, loggedIn, onBack, onReset }) {
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return; startedRef.current = true;
    (async () => {
      try {
        const fd = new FormData();
        if (grant.live) { fd.append('grantId', '__live__'); fd.append('grant', JSON.stringify(grant)); }
        else fd.append('grantId', grant.id);
        fd.append('projektname', proj || '');
        if (pitch.trim()) fd.append('pitch', pitch.trim());
        if (file) fd.append('document', file);
        const res = await fetch('/api/generate', { method:'POST', body: fd });
        if (!res.ok && res.headers.get('content-type')?.includes('application/json')) {
          const e = await res.json().catch(()=>({})); throw new Error(e.error || `Fehler ${res.status}`);
        }
        let full = '';
        await readStream(res, (chunk)=>{ full += chunk; setText(t=>t+chunk); });
        setDone(true);
        // Eingeloggt → Antrag im Verlauf speichern.
        if (loggedIn && pitchId && full.trim()) {
          try {
            await fetch('/api/antraege', { method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ pitch_id: pitchId, grant_id: grant.id || '', grant_name: grant.name || '', content: full }) });
            setSaved(true);
          } catch {}
        }
      } catch (e) { setError(e.message); setDone(true); }
    })();
  }, []);

  const gapCount = useMemo(() => (text.match(/\[BITTE ERGÄNZEN/gi) || []).length, [text]);
  const html = useMemo(() => {
    const raw = marked.parse(text || '', { breaks:true });
    const marked_ = raw.replace(/\[BITTE ERGÄNZEN[^\]]*\]/gi, (m) => `<mark class="erg">${m}</mark>`);
    return DOMPurify.sanitize(marked_);
  }, [text]);

  const [editing, setEditing] = useState(false);
  const [docxBusy, setDocxBusy] = useState(false);
  const [comp, setComp] = useState(null);     // {gesamt, items} | null
  const [compBusy, setCompBusy] = useState(false);
  const [compErr, setCompErr] = useState('');
  function copy(){ navigator.clipboard?.writeText(text); }
  function triggerDownload(blob, name){
    const u = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
  }
  function download(){
    triggerDownload(new Blob([text], { type:'text/markdown;charset=utf-8' }), (proj || 'Foerderantrag').replace(/[^\w]+/g,'_') + '.md');
  }
  async function downloadDocx(){
    setDocxBusy(true);
    try {
      const res = await fetch('/api/export', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ content: text, projektname: proj || grant.name }) });
      if (!res.ok) throw new Error('Export fehlgeschlagen');
      triggerDownload(await res.blob(), (proj || 'Foerderantrag').replace(/[^\w]+/g,'_') + '.docx');
    } catch {}
    setDocxBusy(false);
  }
  async function checkCompliance(){
    setCompBusy(true); setCompErr(''); setComp(null);
    try {
      const body = grant.live ? { grant: JSON.stringify(grant), content: text } : { grantId: grant.id, content: text };
      const res = await fetch('/api/compliance', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || ('Fehler '+res.status));
      setComp(d);
    } catch (e) { setCompErr(e.message); }
    setCompBusy(false);
  }
  const compColor = (s) => /erf[üu]llt/i.test(s) ? 'var(--cobalt)' : /teil/i.test(s) ? 'var(--honey)' : 'var(--terracotta)';
  const [chk, setChk] = useState(null);
  const [chkBusy, setChkBusy] = useState(false);
  const [chkErr, setChkErr] = useState('');
  async function loadChecklist(){
    setChkBusy(true); setChkErr(''); setChk(null);
    try {
      const body = grant.live ? { grant: JSON.stringify(grant), plan: text } : { grantId: grant.id, plan: text };
      const res = await fetch('/api/checklist', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || ('Fehler '+res.status));
      setChk(d);
    } catch (e) { setChkErr(e.message); }
    setChkBusy(false);
  }
  const formInputRef = useRef(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formMsg, setFormMsg] = useState('');
  async function fillForm(file){
    if (!file) return;
    setFormBusy(true); setFormMsg('');
    try {
      const fd = new FormData();
      fd.append('form', file); fd.append('content', text); fd.append('projektname', proj || grant.name);
      const res = await fetch('/api/fillform', { method:'POST', body: fd });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || ('Fehler '+res.status)); }
      const n = res.headers.get('X-Fields-Filled');
      triggerDownload(await res.blob(), (proj || 'Antrag').replace(/[^\w]+/g,'_') + '_ausgefuellt.pdf');
      setFormMsg('✓ Formular befüllt'+(n?` (${n} Felder)`:'')+' — heruntergeladen. Bitte prüfen & offene Felder ergänzen.');
    } catch (e) { setFormMsg('Fehler: '+e.message); }
    setFormBusy(false);
  }
  async function autoFillForm(){
    setFormBusy(true); setFormMsg('Nomos sucht das passende Formular und füllt es aus …');
    try {
      const body = { content: text, projektname: proj || grant.name, name: grant.name, provider: grant.provider, region: grant.region };
      if (grant.formUrl) body.formUrl = grant.formUrl;
      const res = await fetch('/api/fillform-url', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || ('Fehler '+res.status)); }
      const n = res.headers.get('X-Fields-Filled');
      triggerDownload(await res.blob(), (proj || 'Antrag').replace(/[^\w]+/g,'_') + '_ausgefuellt.pdf');
      setFormMsg('✓ Passendes Formular automatisch geladen & befüllt'+(n?` (${n} Felder)`:'')+' — heruntergeladen. Bitte prüfen & offene Felder ergänzen.');
    } catch (e) { setFormMsg('Automatisch nicht möglich ('+e.message+'). Bitte Formular manuell hochladen.'); }
    setFormBusy(false);
  }

  return (
    <main className="anim-fadein mx-auto max-w-4xl px-6 pb-24 pt-8 md:px-12">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cream-300 bg-cream-50 px-5 py-4">
        <div className="flex items-center gap-3">
          <NomosMark size={22} color="var(--ink-900)" />
          <div>
            <div className="brand-mono uppercase text-ink-500" style={{ fontSize:10, letterSpacing:'0.14em' }}>ANTRAGSENTWURF · NOMOS</div>
            <div className="text-sm font-medium">{grant.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="rounded-full border border-cream-400 px-4 py-2 text-sm text-ink-900 transition-colors hover:border-ink-900">← Förderlinien</button>
          <button onClick={()=>setEditing(e=>!e)} disabled={!done} className={"rounded-full px-4 py-2 text-sm transition-colors disabled:opacity-40 "+(editing?'bg-terracotta text-cream-50':'border border-cream-400 text-ink-900 enabled:hover:border-ink-900')}>{editing?'Vorschau':'Bearbeiten'}</button>
          <button onClick={downloadDocx} disabled={!done||docxBusy} className="rounded-full border border-cream-400 px-4 py-2 text-sm text-ink-900 transition-colors enabled:hover:border-ink-900 disabled:opacity-40">{docxBusy?'… .docx':'⬇ .docx'}</button>
          <button onClick={download} disabled={!done} className="rounded-full border border-cream-400 px-4 py-2 text-sm text-ink-900 transition-colors enabled:hover:border-ink-900 disabled:opacity-40">⬇ .md</button>
          <button onClick={copy} disabled={!done} className="rounded-full border border-cream-400 px-4 py-2 text-sm text-ink-900 transition-colors enabled:hover:border-ink-900 disabled:opacity-40">Kopieren</button>
          <button onClick={()=>window.print()} disabled={!done} className="rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-cream-100 transition-all enabled:hover:scale-[1.03] disabled:opacity-30">PDF</button>
        </div>
      </div>

      <div className="no-print mb-8 rounded-2xl bg-ink-900 p-5 text-cream-100">
        <div className="flex items-center justify-between">
          <span className="brand-mono" style={{ fontSize:11, letterSpacing:'0.14em', color:'rgba(245,240,230,0.65)' }}>{done?'FERTIG · ENTWURF (≈80 %)':'NOMOS GENERIERT …'}</span>
          {!done && <span className="spin"><NomosMark size={16} color="var(--honey)" /></span>}
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          {done ? <div className="h-full rounded-full bg-honey" style={{ width:'80%' }} /> : <div className="relative h-full w-full"><div className="indet" /></div>}
        </div>
        {done && !error && <p className="anim-fadein mt-3 text-sm leading-relaxed text-cream-300">Die verbleibenden ~20 % (persönliche Angaben, rechtsverbindliche Erklärungen, Unterschriften, Anlagen) ergänzt du selbst. Mit „[BITTE ERGÄNZEN]“ markierte Stellen brauchen deinen Input.{saved && ' · ✓ in deinem Verlauf gespeichert'}</p>}
        {error && <p className="mt-3 text-sm text-honey">Fehler: {error}</p>}
      </div>

      {done && !error && gapCount > 0 && (
        <div className="no-print anim-fadein mb-6 flex items-start gap-3 rounded-2xl border border-honey bg-[#ECD6AB]/40 px-5 py-4">
          <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-honey brand-mono text-ink-900" style={{ fontSize:11 }}>{gapCount}</span>
          <div>
            <div className="text-sm font-medium text-ink-900">Diese {gapCount} {gapCount===1?'Stelle braucht':'Stellen brauchen'} deinen Input</div>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-700">Gelb markierte <strong>[BITTE ERGÄNZEN]</strong>-Felder im Entwurf ergänzt du selbst — sie gehören zu den letzten ~20 % (persönliche Angaben, Erklärungen, Unterschriften).</p>
          </div>
        </div>)}

      {/* Vorgaben-Check */}
      {done && !error && (
        <div className="no-print mb-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Eyebrow>VORGABEN-CHECK · {grant.name}</Eyebrow>
            <button onClick={checkCompliance} disabled={compBusy} className="inline-flex items-center gap-2 rounded-full border border-cobalt px-4 py-2 text-xs text-ink-900 transition-colors enabled:hover:bg-cobalt enabled:hover:text-cream-50 disabled:opacity-40">
              {compBusy ? <><span className="spin"><NomosMark size={13} color="var(--cobalt)" /></span> prüft …</> : 'Entwurf gegen Förder-Vorgaben prüfen'}
            </button>
          </div>
          {compErr && <div className="rounded-2xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-sm text-ink-900">{compErr}</div>}
          {comp && (
            <div className="anim-fadein rounded-3xl border border-cream-300 bg-cream-50 p-5">
              {comp.gesamt && <p className="mb-3 text-sm font-medium text-ink-900">{comp.gesamt}</p>}
              <div className="flex flex-col gap-2.5">
                {(comp.items||[]).map((it,i)=>(
                  <div key={i} className="flex items-start gap-3">
                    <span className="brand-mono mt-0.5 flex-none rounded-full px-2 py-0.5 text-cream-50" style={{ fontSize:9, letterSpacing:'0.08em', background:compColor(it.status) }}>{(it.status||'').toUpperCase()}</span>
                    <div><div className="text-sm font-medium text-ink-900">{it.anforderung}</div><div className="mt-0.5 text-sm leading-relaxed text-ink-700">{it.hinweis}</div></div>
                  </div>))}
              </div>
            </div>)}
        </div>)}

      {/* Checkliste: zusätzlich nötige Unterlagen */}
      {done && !error && (
        <div className="no-print mb-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Eyebrow>CHECKLISTE · ZUSÄTZLICH EINREICHEN</Eyebrow>
            <button onClick={loadChecklist} disabled={chkBusy} className="inline-flex items-center gap-2 rounded-full border border-honey px-4 py-2 text-xs text-ink-900 transition-colors enabled:hover:bg-honey disabled:opacity-40">
              {chkBusy ? <><span className="spin"><NomosMark size={13} color="var(--honey)" /></span> erstellt …</> : 'Checkliste erstellen'}
            </button>
          </div>
          {chkErr && <div className="rounded-2xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-sm text-ink-900">{chkErr}</div>}
          {chk && (
            <div className="anim-fadein rounded-3xl border border-cream-300 bg-cream-50 p-5">
              {chk.gesamt && <p className="mb-3 text-sm font-medium text-ink-900">{chk.gesamt}</p>}
              <div className="flex flex-col gap-2.5">
                {(chk.items||[]).map((it,i)=>(
                  <div key={i} className="flex items-start gap-3">
                    <span className="brand-mono mt-0.5 flex-none rounded-full px-2 py-0.5 text-cream-50" style={{ fontSize:9, letterSpacing:'0.08em', background: it.pflicht ? 'var(--terracotta)' : 'var(--cobalt)' }}>{it.pflicht ? 'PFLICHT' : 'OPTIONAL'}</span>
                    <div><div className="text-sm font-medium text-ink-900">{it.dokument}</div><div className="mt-0.5 text-sm leading-relaxed text-ink-700">{it.hinweis}</div></div>
                  </div>))}
              </div>
              <p className="mt-3 brand-mono text-ink-500" style={{ fontSize:9, letterSpacing:'0.1em' }}>● TYPISCHE ANGABEN — VERBINDLICH BEI DER BEWILLIGUNGSSTELLE PRÜFEN. WEITERE TELOS-PRODUKTE (ELENCHOS · METRON · AGORA · HERMES) UNTERSTÜTZEN HIER KÜNFTIG.</p>
            </div>)}
        </div>)}

      {/* Offizielles Formular ausfüllen (PDF) */}
      {done && !error && (
        <div className="no-print mb-8 rounded-3xl border border-cobalt/40 bg-cobalt/5 p-5">
          <div className="flex items-center gap-2"><span className="brand-mono rounded-full bg-cobalt px-2 py-0.5 text-cream-50" style={{ fontSize:9, letterSpacing:'0.12em' }}>NEU</span><Eyebrow>OFFIZIELLES FORMULAR AUTOMATISCH AUSFÜLLEN</Eyebrow></div>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">Nomos sucht das passende <strong>PDF-Formular</strong> der Förderung, lädt es und überträgt die Inhalte deines Entwurfs in die richtigen Felder — die letzten 20 % ergänzt du. Findet Nomos kein ausfüllbares Formular, lade es einfach selbst hoch.</p>
          <input ref={formInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) fillForm(f); e.target.value=''; }} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={autoFillForm} disabled={formBusy} className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-cream-100 transition-transform enabled:hover:scale-[1.03] disabled:opacity-40">
              {formBusy ? <><span className="spin"><NomosMark size={14} color="var(--honey)" /></span> befüllt …</> : 'Passendes Formular holen & ausfüllen'}
            </button>
            <button onClick={()=>formInputRef.current?.click()} disabled={formBusy} className="rounded-full border border-cream-400 px-5 py-2.5 text-sm text-ink-900 transition-colors enabled:hover:border-ink-900 disabled:opacity-40">
              Stattdessen PDF hochladen
            </button>
          </div>
          {formMsg && <p className="mt-2 text-sm text-ink-700">{formMsg}</p>}
          <p className="mt-2 brand-mono text-ink-500" style={{ fontSize:9, letterSpacing:'0.1em' }}>● NUR AUSFÜLLBARE PDF-FORMULARE (ACROFORM). KEIN AUTOMATISCHES ABSENDEN AN BEHÖRDENPORTALE.</p>
        </div>)}

      {editing && (
        <p className="no-print anim-fadein mb-3 text-sm text-ink-500">Bearbeitungsmodus — Text (Markdown) direkt anpassen, fehlende Infos ergänzen. „Vorschau" zeigt das formatierte Ergebnis, „⬇ .docx"/„⬇ .md"/„PDF" exportieren den aktuellen Stand.</p>
      )}
      <article className="print-doc rounded-3xl border border-cream-300 bg-cream-50 p-8 md:p-12">
        {editing
          ? <textarea value={text} onChange={e=>setText(e.target.value)} spellCheck={true}
              className="brand-mono h-[60vh] w-full resize-y rounded-xl border border-cream-300 bg-cream-100 p-4 text-[13px] leading-relaxed text-ink-900 outline-none focus:border-ink-900" />
          : (text ? <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
              : <div className="flex items-center gap-3 text-ink-500"><span className="spin"><NomosMark size={18} color="var(--ink-500)" /></span><span className="brand-mono" style={{ fontSize:12 }}>Nomos formuliert …</span></div>)}
        {done && !error && (
          <footer className="anim-fadein mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-cream-300 pt-6">
            <span className="brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.14em' }}>ERSTELLT MIT NOMOS · POWERED BY TELOS</span>
            <button onClick={onReset} className="brand-mono text-terracotta hover:underline" style={{ fontSize:11, letterSpacing:'0.1em' }}>↺ NEUES VORHABEN</button>
          </footer>)}
      </article>
    </main>
  );
}

function Footer({ go, startPitch }) {
  const build = useVersion();
  return (
    <footer className="no-print border-t border-cream-300 px-6 py-12 md:px-12">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.3fr_0.8fr_1.2fr_0.9fr]">
        <div>
          <div className="flex items-center gap-3"><TelosLockup size={22} />
            <span className="brand-mono text-ink-500" style={{ fontSize:10, letterSpacing:'0.18em' }}>· NOMOS</span></div>
          <p className="mt-4 max-w-xs brand-serif italic text-ink-700" style={{ fontSize:18 }}>From Vision to Grant. Seamlessly.</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-500">Telos übersetzt rohe Startup-Visionen in strukturierte institutionelle Realität.</p>
        </div>
        <div>
          <div className="brand-mono uppercase text-ink-500" style={{ fontSize:10, letterSpacing:'0.16em' }}>Produkt</div>
          <ul className="mt-3 flex flex-col gap-2">
            {NAV_ITEMS.map(([l,p]) => (
              <li key={p}><button onClick={()=>go(p)} className="text-sm text-ink-700 transition-colors hover:text-ink-900">{l}</button></li>
            ))}
          </ul>
        </div>
        <div>
          <div className="brand-mono uppercase text-ink-500" style={{ fontSize:10, letterSpacing:'0.16em' }}>Impressum</div>
          <div className="mt-3 flex flex-col gap-0.5 text-sm leading-relaxed text-ink-700">
            <span className="font-medium text-ink-900">[Firmenname] GmbH</span>
            <span>[Straße Nr.]</span>
            <span>[PLZ Ort], Deutschland</span>
            <span className="mt-1.5">Vertreten durch: [Name]</span>
            <span>Kontakt: [E-Mail] · [Telefon]</span>
            <span>USt-IdNr.: [DE… optional]</span>
          </div>
          <p className="mt-2 brand-mono uppercase text-ink-300" style={{ fontSize:9, letterSpacing:'0.12em' }}>Platzhalter — vor Veröffentlichung ersetzen</p>
        </div>
        <div>
          <div className="brand-mono uppercase text-ink-500" style={{ fontSize:10, letterSpacing:'0.16em' }}>Los geht's</div>
          <button onClick={startPitch} className="mt-3 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-cream-100 transition-transform hover:scale-[1.03]">Pitch hochladen →</button>
          <p className="mt-4 brand-mono uppercase text-ink-300" style={{ fontSize:10, letterSpacing:'0.14em' }}>Berlin · Wien · Zürich</p>
        </div>
      </div>

      {/* Datenschutz / Trust */}
      <div className="mx-auto mt-10 max-w-6xl rounded-2xl border border-cream-300 bg-cream-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="text-base leading-none">🔒</span>
          <p className="text-sm leading-relaxed text-ink-700">
            <span className="font-medium text-ink-900">Datenschutz:</span> TLS-verschlüsselte Übertragung · ohne Konto wird nichts gespeichert,
            mit Konto liegen Analyse & Eingaben nur in deinem Konto (jederzeit löschbar) · hochgeladene Dateien werden nicht dauerhaft
            gespeichert · Inhalte werden laut Anthropics Geschäftsbedingungen nicht zum Training der KI-Modelle verwendet · auf DSGVO-Konformität ausgelegt.
          </p>
        </div>
      </div>

      <div className="mx-auto mt-8 flex max-w-6xl items-center justify-between border-t border-cream-300 pt-5">
        <span className="brand-mono uppercase text-ink-500" style={{ fontSize:10, letterSpacing:'0.16em' }}>© 2026 Telos AI · powered by Nomos{build ? ` · Build ${build}` : ''}</span>
        <NomosMark size={18} color="var(--ink-300)" />
      </div>
    </footer>);
}

/* ── streaming helper ──────────────────────────────────────────────────── */
async function readStream(res, onChunk) {
  if (!res.body) { onChunk(await res.text()); return; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(dec.decode(value, { stream:true }));
  }
}

/* ── Download- & Druck-Helfer ──────────────────────────────────────────────── */
function downloadBlob(blob, name) {
  const u = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
}
const safeFile = (s) => (s || 'Telos').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || 'Telos';
// Projektname aus dem Businessplan-Entwurf lesen ("# Businessplan (Entwurf) — <Name>").
function extractPlanTitle(md) {
  const m = String(md || '').match(/^#\s*Businessplan[^\n]*?[—\-]\s*(.+?)\s*$/m);
  if (m && m[1]) return m[1].trim();
  const h = String(md || '').match(/^#\s+(.+?)\s*$/m);
  return h ? h[1].replace(/^Businessplan[^\wÄÖÜ]*/i, '').trim() : '';
}
// Sanitisierte HTML in einem Druckfenster öffnen → Nutzer wählt „Als PDF speichern".
function printHtmlAsPdf(innerHtml, title) {
  const w = window.open('', '_blank');
  if (!w) { alert('Bitte Pop-ups für diese Seite erlauben, um als PDF zu speichern.'); return; }
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title || 'Telos · Nomos'}</title>
    <style>
      @page { size: A4; margin: 22mm 18mm; }
      body { font-family: Georgia, 'Times New Roman', serif; color:#26221C; line-height:1.55; font-size:11pt; }
      h1,h2,h3 { font-family: Georgia, serif; color:#26221C; line-height:1.2; margin:1.1em 0 .4em; }
      h1 { font-size:20pt; } h2 { font-size:15pt; } h3 { font-size:12.5pt; }
      p,li { font-size:11pt; } ul,ol { padding-left:1.2em; }
      table { width:100%; border-collapse:collapse; margin:.6em 0; }
      th,td { border:1px solid #C8BD9F; padding:6px 8px; text-align:left; font-size:10pt; }
      .telos-foot { margin-top:14mm; font-size:8pt; color:#736C63; letter-spacing:.12em; text-transform:uppercase; }
    </style></head>
    <body>${innerHtml}<div class="telos-foot">Telos · Nomos — Entwurf, bitte „[BITTE ERGÄNZEN]\"-Stellen prüfen</div></body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => { w.print(); }, 350);
}

createRoot(document.getElementById('root')).render(<App />);

