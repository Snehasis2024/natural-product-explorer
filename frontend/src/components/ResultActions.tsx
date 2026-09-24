import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Box, Columns3, X } from 'lucide-react';
import { MAX_COMPARE, useApp, useEngineQuery } from '../lib/app-context';
import { MolViewer3D } from './MolViewer3D';
import { ErrorState, Spinner } from './ui';

export function Preview3DModal({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const { data, loading, error } = useEngineQuery((e) => e.conformer(id), [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`3D preview of ${name}`} onClick={onClose}>
      <div className="panel w-full max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <span className="font-medium text-ink">{name}</span>
          <Link to={`/compound/${id}`} className="ml-auto text-[13px] text-accent hover:underline">Open explorer →</Link>
          <button className="btn-icon h-8 w-8" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="h-[60vh] min-h-[320px] p-2">
          {loading && <div className="grid h-full place-items-center"><Spinner label="Loading conformer" /></div>}
          {error && <ErrorState message={error} />}
          {data && <MolViewer3D molblock={data.molblock} partialCharges={data.partial_charges} method={data.method} title={name} fileName={id} className="h-full" initialRepresentation="stick" />}
        </div>
      </div>
    </div>
  );
}

export function ResultActions({ id, name, dense }: { id: string; name: string; dense?: boolean }) {
  const { compare, toggleCompare } = useApp();
  const [show3d, setShow3d] = useState(false);
  const inCmp = compare.includes(id);
  const cls = clsx('btn', dense && 'px-2 py-1 text-[12px]');
  return (
    <div className="flex flex-wrap gap-1.5">
      <Link to={`/compound/${id}`} className={cls}>View</Link>
      <button className={cls} onClick={() => setShow3d(true)} aria-label={`3D preview of ${name}`}><Box className="h-3.5 w-3.5" /> 3D</button>
      <button className={clsx(cls, inCmp && 'border-accent text-accent')} onClick={() => toggleCompare(id)} disabled={!inCmp && compare.length >= MAX_COMPARE}
        aria-pressed={inCmp} aria-label={inCmp ? `Remove ${name} from comparison` : `Add ${name} to comparison`}>
        <Columns3 className="h-3.5 w-3.5" /> {inCmp ? 'Added' : 'Compare'}
      </button>
      {show3d && <Preview3DModal id={id} name={name} onClose={() => setShow3d(false)} />}
    </div>
  );
}
