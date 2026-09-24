import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import clsx from 'clsx';
import * as $3Dmol from '3dmol';
import { Camera, Crosshair, Download, Expand, Maximize2, RotateCcw, Settings2, X } from 'lucide-react';
import { useApp } from '../lib/app-context';

export type Representation = 'ballstick' | 'stick' | 'sphere' | 'line';
type Background = 'theme' | 'black' | 'white';
type ColorMode = 'element' | 'charge';

export interface ViewerHandle {
  viewer: any | null;
}

interface AtomInfo {
  index: number;
  serial: number;
  elem: string;
  x: number; y: number; z: number;
  formalCharge: number;
  partialCharge: number | null;
  bonds: { index: number; elem: string; order: number; length: number }[];
}

interface Props {
  molblock: string | null;
  title?: string;
  fileName?: string;
  partialCharges?: number[] | null;
  method?: string;
  compact?: boolean;
  className?: string;
  spin?: boolean;
  initialRepresentation?: Representation;
  onReady?: (viewer: any) => void;
}

const BOND_ORDER_LABEL: Record<number, string> = { 1: 'single', 2: 'double', 3: 'triple', 4: 'aromatic' };

/** Formal charges from the V2000 "M  CHG" lines (1-based atom numbers). */
function formalCharges(molblock: string): Map<number, number> {
  const map = new Map<number, number>();
  for (const line of molblock.split('\n')) {
    if (!line.startsWith('M  CHG')) continue;
    const parts = line.trim().split(/\s+/).slice(3).map(Number);
    for (let i = 0; i + 1 < parts.length; i += 2) map.set(parts[i] - 1, parts[i + 1]);
  }
  return map;
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#0b1118';
}

export const MolViewer3D = forwardRef<ViewerHandle, Props>(function MolViewer3D(
  { molblock, title, fileName, partialCharges, method, compact, className, spin, initialRepresentation = 'ballstick', onReady },
  ref,
) {
  const { theme } = useApp();
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const labelsRef = useRef<any[]>([]);
  const hoverLabelRef = useRef<any>(null);
  const [rep, setRep] = useState<Representation>(initialRepresentation);
  const [bondRadius, setBondRadius] = useState(0.14);
  const [multipleBonds, setMultipleBonds] = useState(true);
  const [showH, setShowH] = useState(true);
  const [labels, setLabels] = useState(false);
  const [surface, setSurface] = useState(false);
  const [surfaceOpacity, setSurfaceOpacity] = useState(0.55);
  const [colorMode, setColorMode] = useState<ColorMode>('element');
  const [bg, setBg] = useState<Background>('theme');
  const [selected, setSelected] = useState<AtomInfo | null>(null);
  const [panelOpen, setPanelOpen] = useState(() => !compact && typeof window !== 'undefined' && window.innerWidth >= 1280);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useImperativeHandle(ref, () => ({ get viewer() { return viewerRef.current; } }), []);

  const background = bg === 'black' ? '#000000' : bg === 'white' ? '#ffffff' : cssVar('--viewer-bg');
  const hasPartial = !!partialCharges && partialCharges.length > 0;

  // create viewer once
  useEffect(() => {
    if (!hostRef.current) return;
    try {
      const v = $3Dmol.createViewer(hostRef.current, { backgroundColor: background, antialias: true, id: undefined } as any);
      viewerRef.current = v;
      onReady?.(v);
    } catch (e) {
      setWebglError('3D rendering needs WebGL, which is unavailable in this browser.');
    }
    const ro = new ResizeObserver(() => viewerRef.current?.resize());
    ro.observe(hostRef.current);
    const onFs = () => setIsFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      ro.disconnect();
      document.removeEventListener('fullscreenchange', onFs);
      try { viewerRef.current?.clear(); } catch { /* ignore */ }
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const describeAtom = useCallback((atom: any): AtomInfo => {
    const model = viewerRef.current.getModel();
    const atoms = model.selectedAtoms({});
    const fc = formalCharges(molblock || '');
    return {
      index: atom.index,
      serial: atom.serial ?? atom.index + 1,
      elem: atom.elem,
      x: atom.x, y: atom.y, z: atom.z,
      formalCharge: fc.get(atom.index) ?? 0,
      partialCharge: hasPartial ? partialCharges![atom.index] ?? null : null,
      bonds: (atom.bonds || []).map((b: number, i: number) => {
        const o = atoms[b];
        return { index: b, elem: o.elem, order: atom.bondOrder?.[i] ?? 1, length: Math.hypot(o.x - atom.x, o.y - atom.y, o.z - atom.z) };
      }),
    };
  }, [molblock, hasPartial, partialCharges]);

  const applyStyle = useCallback(() => {
    const v = viewerRef.current;
    if (!v || !v.getModel()) return;
    const model = v.getModel();
    const chargeScheme = { prop: 'partialCharge', gradient: 'rwb', min: -0.4, max: 0.4 };
    const formalScheme = { prop: 'formalCharge', gradient: 'rwb', min: -1, max: 1 };
    const colorOpt = colorMode === 'charge' ? { colorscheme: hasPartial ? chargeScheme : formalScheme } : { colorscheme: theme === 'light' && bg !== 'black' ? 'Jmol' : 'default' };
    let style: any;
    switch (rep) {
      case 'stick': style = { stick: { radius: bondRadius, singleBonds: !multipleBonds, ...colorOpt } }; break;
      case 'sphere': style = { sphere: { scale: 1.0, ...colorOpt } }; break;
      case 'line': style = { line: { linewidth: 2, ...colorOpt } }; break;
      default: style = { stick: { radius: bondRadius, singleBonds: !multipleBonds, ...colorOpt }, sphere: { scale: 0.24, ...colorOpt } };
    }
    v.setStyle({}, style);
    if (!showH) v.setStyle({ elem: 'H' }, {});
    if (selected) {
      v.addStyle({ index: selected.index }, { sphere: { scale: rep === 'sphere' ? 1.08 : 0.42, color: '#46c2b0', opacity: 0.85 } });
    }
    // labels
    labelsRef.current.forEach((l) => v.removeLabel(l));
    labelsRef.current = [];
    if (labels) {
      model.selectedAtoms(showH ? {} : { not: { elem: 'H' } }).forEach((a: any) => {
        labelsRef.current.push(v.addLabel(`${a.elem}${a.serial ?? a.index + 1}`, {
          position: { x: a.x, y: a.y, z: a.z }, fontSize: 10, fontColor: bg === 'white' || (bg === 'theme' && theme === 'light') ? '#111' : '#eee',
          backgroundOpacity: 0, inFront: true, alignment: 'center',
        }));
      });
    }
    v.removeAllSurfaces();
    if (surface) {
      const surfColor = colorMode === 'charge' ? { colorscheme: hasPartial ? chargeScheme : formalScheme } : { color: '#46c2b0' };
      v.addSurface($3Dmol.SurfaceType.VDW, { opacity: surfaceOpacity, ...surfColor }, showH ? {} : { not: { elem: 'H' } });
    }
    v.render();
  }, [rep, bondRadius, multipleBonds, showH, labels, surface, surfaceOpacity, colorMode, selected, theme, bg, hasPartial]);

  // load model
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.clear();
    labelsRef.current = [];
    setSelected(null);
    if (!molblock) { v.render(); return; }
    const model = v.addModel(molblock, 'sdf', { keepH: true });
    const fc = formalCharges(molblock);
    model.selectedAtoms({}).forEach((a: any) => {
      const formal = fc.get(a.index) ?? 0;
      const partial = hasPartial ? partialCharges![a.index] ?? 0 : 0;
      a.properties = { ...(a.properties || {}), formalCharge: formal, partialCharge: partial };
      a.formalCharge = formal;
      a.partialCharge = partial;
    });
    v.setClickable({}, true, (atom: any) => setSelected((cur) => (cur && cur.index === atom.index ? null : describeAtom(atom))));
    v.setHoverable({}, true,
      (atom: any) => {
        if (hoverLabelRef.current) v.removeLabel(hoverLabelRef.current);
        hoverLabelRef.current = v.addLabel(`${atom.elem}${atom.serial ?? atom.index + 1}`, {
          position: { x: atom.x, y: atom.y, z: atom.z }, fontSize: 12, backgroundColor: '#0a0f15', backgroundOpacity: 0.8, fontColor: '#e2e9f1', inFront: true,
        });
        v.render();
      },
      () => {
        if (hoverLabelRef.current) { v.removeLabel(hoverLabelRef.current); hoverLabelRef.current = null; v.render(); }
      },
    );
    applyStyle();
    v.zoomTo();
    v.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [molblock, partialCharges]);

  useEffect(() => { applyStyle(); }, [applyStyle]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.setBackgroundColor(background, 1);
    v.render();
  }, [background]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    v.spin(spin && !reduce ? 'y' : false, 0.6);
  }, [spin, molblock]);

  const reset = () => { const v = viewerRef.current; if (!v) return; v.setView([0, 0, 0, 0, 0, 0, 0, 1]); v.zoomTo(); v.render(); };
  const center = () => { const v = viewerRef.current; if (!v) return; v.center({}, 400); };
  const fit = () => { const v = viewerRef.current; if (!v) return; v.zoomTo({}, 400); };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrapRef.current?.requestFullscreen();
    } catch { /* fullscreen not permitted (e.g. embedded frame) */ }
  };
  const save = (href: string, name: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const base = (fileName || title || 'molecule').replace(/[^\w.-]+/g, '_');
  const screenshot = () => { const v = viewerRef.current; if (v) save(v.pngURI(), `${base}.png`); };
  const downloadStructure = () => {
    if (!molblock) return;
    const blob = new Blob([molblock.endsWith('$$$$\n') ? molblock : `${molblock}\n$$$$\n`], { type: 'chemical/x-mdl-sdfile' });
    const url = URL.createObjectURL(blob);
    save(url, `${base}.sdf`);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const toolbarBtn = 'btn-icon h-8 w-8 bg-surface/80 backdrop-blur';
  return (
    <div ref={wrapRef} className={clsx('relative overflow-hidden rounded-panel border border-line', isFullscreen && 'rounded-none', className)} style={{ background }}>
      <div ref={hostRef} className="absolute inset-0" aria-label={title ? `Interactive 3D model of ${title}` : 'Interactive 3D model'} role="img" />
      {webglError && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">{webglError}</div>}
      {!molblock && !webglError && <div className="absolute inset-0 grid place-items-center text-sm text-muted">No 3D structure loaded</div>}

      {/* toolbar */}
      {!compact || isFullscreen ? (
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          <button className={toolbarBtn} title="Reset view" aria-label="Reset view" onClick={reset}><RotateCcw className="h-4 w-4" /></button>
          <button className={toolbarBtn} title="Center molecule" aria-label="Center molecule" onClick={center}><Crosshair className="h-4 w-4" /></button>
          <button className={toolbarBtn} title="Fit molecule" aria-label="Fit molecule" onClick={fit}><Maximize2 className="h-4 w-4" /></button>
          <button className={toolbarBtn} title="Fullscreen" aria-label="Toggle fullscreen" onClick={fullscreen}><Expand className="h-4 w-4" /></button>
          <button className={toolbarBtn} title="Screenshot (PNG)" aria-label="Save screenshot" onClick={screenshot}><Camera className="h-4 w-4" /></button>
          <button className={toolbarBtn} title="Download structure (SDF)" aria-label="Download structure as SDF" onClick={downloadStructure} disabled={!molblock}><Download className="h-4 w-4" /></button>
        </div>
      ) : (
        <div className="absolute left-2 top-2 flex gap-1">
          <button className={toolbarBtn} title="Fit" aria-label="Fit molecule" onClick={fit}><Maximize2 className="h-3.5 w-3.5" /></button>
          <button className={toolbarBtn} title="Fullscreen" aria-label="Toggle fullscreen" onClick={fullscreen}><Expand className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* display settings */}
      {(!compact || isFullscreen) && (
        <div className="absolute right-2 top-2 flex max-h-[calc(100%-1rem)] flex-col items-end gap-2">
          <button className={toolbarBtn} aria-expanded={panelOpen} aria-label="Display settings" title="Display settings" onClick={() => setPanelOpen((o) => !o)}>
            {panelOpen ? <X className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
          </button>
          {panelOpen && (
            <div className="glass w-56 space-y-3 overflow-y-auto rounded-md border border-line p-3 text-[12px] text-ink">
              <fieldset className="space-y-1.5">
                <legend className="label mb-1">Atoms</legend>
                <div className="grid grid-cols-2 gap-1">
                  {(['ballstick', 'stick', 'sphere', 'line'] as Representation[]).map((r) => (
                    <button key={r} onClick={() => setRep(r)} aria-pressed={rep === r}
                      className={clsx('rounded border px-2 py-1 text-left', rep === r ? 'border-accent bg-accent/15 text-accent' : 'border-line hover:border-accent/50')}>
                      {{ ballstick: 'Ball & stick', stick: 'Stick', sphere: 'Spacefill', line: 'Line' }[r]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="space-y-1.5" disabled={rep === 'sphere' || rep === 'line'}>
                <legend className="label mb-1">Bonds</legend>
                <label className="flex items-center justify-between gap-2" htmlFor="bond-radius">Radius
                  <input id="bond-radius" type="range" min={0.06} max={0.3} step={0.02} value={bondRadius} onChange={(e) => setBondRadius(+e.target.value)} className="w-24 accent-[rgb(var(--accent))]" />
                </label>
                <label className="flex items-center gap-2" htmlFor="multi-bonds"><input id="multi-bonds" type="checkbox" checked={multipleBonds} onChange={(e) => setMultipleBonds(e.target.checked)} /> Show bond orders</label>
              </fieldset>
              <fieldset className="space-y-1.5">
                <legend className="label mb-1">Display</legend>
                <label className="flex items-center gap-2" htmlFor="show-h"><input id="show-h" type="checkbox" checked={showH} onChange={(e) => setShowH(e.target.checked)} /> Hydrogens</label>
                <label className="flex items-center gap-2" htmlFor="show-labels"><input id="show-labels" type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Atom labels</label>
                <label className="flex items-center gap-2" htmlFor="show-surface"><input id="show-surface" type="checkbox" checked={surface} onChange={(e) => setSurface(e.target.checked)} /> Van der Waals surface</label>
                {surface && (
                  <label className="flex items-center justify-between gap-2 pl-5" htmlFor="surface-opacity">Opacity
                    <input id="surface-opacity" type="range" min={0.15} max={1} step={0.05} value={surfaceOpacity} onChange={(e) => setSurfaceOpacity(+e.target.value)} className="w-20" />
                  </label>
                )}
              </fieldset>
              <fieldset className="space-y-1.5">
                <legend className="label mb-1">Colour</legend>
                <div className="grid grid-cols-2 gap-1">
                  {(['element', 'charge'] as ColorMode[]).map((c) => (
                    <button key={c} onClick={() => setColorMode(c)} aria-pressed={colorMode === c}
                      className={clsx('rounded border px-2 py-1', colorMode === c ? 'border-accent bg-accent/15 text-accent' : 'border-line hover:border-accent/50')}>
                      {c === 'element' ? 'Element' : 'Charge'}
                    </button>
                  ))}
                </div>
                {colorMode === 'charge' && (
                  <div className="space-y-1">
                    <div className="h-2 rounded" style={{ background: 'linear-gradient(90deg,#e0413a,#ffffff,#3a6fe0)' }} />
                    <div className="flex justify-between text-[10px] text-muted"><span>{hasPartial ? '−0.4 e' : '−1'}</span><span>0</span><span>{hasPartial ? '+0.4 e' : '+1'}</span></div>
                    <p className="text-[10px] text-muted">{hasPartial ? 'Gasteiger–Marsili partial charges (RDKit, calculated)' : 'Formal charges (partial charges need the API or a database compound)'}</p>
                  </div>
                )}
              </fieldset>
              <fieldset className="space-y-1.5">
                <legend className="label mb-1">Background</legend>
                <div className="grid grid-cols-3 gap-1">
                  {(['theme', 'black', 'white'] as Background[]).map((b) => (
                    <button key={b} onClick={() => setBg(b)} aria-pressed={bg === b}
                      className={clsx('rounded border px-1 py-1 capitalize', bg === b ? 'border-accent bg-accent/15 text-accent' : 'border-line hover:border-accent/50')}>{b}</button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
        </div>
      )}

      {/* atom info */}
      {selected && (
        <div className="glass absolute bottom-2 left-2 w-[min(18rem,calc(100%-1rem))] rounded-md border border-line p-3 text-[12px] text-ink" aria-live="polite">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">Atom {selected.elem}{selected.serial}</span>
            <button aria-label="Close atom info" className="text-muted hover:text-ink" onClick={() => setSelected(null)}><X className="h-3.5 w-3.5" /></button>
          </div>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 font-mono text-[11.5px]">
            <dt className="text-muted">Element</dt><dd>{selected.elem}</dd>
            <dt className="text-muted">Index</dt><dd className="num">{selected.serial} <span className="text-faint">(0-based {selected.index})</span></dd>
            <dt className="text-muted">Formal charge</dt><dd className="num">{selected.formalCharge > 0 ? `+${selected.formalCharge}` : selected.formalCharge}</dd>
            {selected.partialCharge !== null && (<><dt className="text-muted">Partial q</dt><dd className="num">{selected.partialCharge.toFixed(3)} e</dd></>)}
            <dt className="text-muted">x, y, z (Å)</dt><dd className="num">{selected.x.toFixed(3)}, {selected.y.toFixed(3)}, {selected.z.toFixed(3)}</dd>
            <dt className="text-muted">Bonds</dt>
            <dd className="space-y-0.5">
              {selected.bonds.map((b) => (
                <div key={b.index} className="num">→ {b.elem}{b.index + 1} · {BOND_ORDER_LABEL[b.order] ?? b.order} · {b.length.toFixed(3)} Å</div>
              ))}
            </dd>
          </dl>
        </div>
      )}
      {method && !selected && !compact && (
        <p className="pointer-events-none absolute bottom-2 right-3 max-w-[70%] text-right text-[10.5px] text-muted/90">3D conformer: {method} · click an atom for details</p>
      )}
    </div>
  );
});
