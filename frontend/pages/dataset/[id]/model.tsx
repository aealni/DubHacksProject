import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import CanvasBackground from '../../../components/CanvasBackground';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface ModelRun {
  run_id: string;
  dataset_id: number;
  status: 'pending'|'running'|'completed'|'failed';
  target: string;
  problem_type: string;
  metrics?: { problem_type: string; metric_primary: string; metric_value: number; additional: Record<string, any>; };
  feature_importance?: { feature: string; importance: number; }[];
  sample_predictions?: { row_index: number; prediction: any; actual?: any; probability?: any; }[];
  created_at: string;
  completed_at?: string;
  message?: string;
}

interface VisualResponse {
  run_id: string;
  kind: VisualKind;
  problem_type: string;
  sampled: number;
  total: number;
  data: any;
  message?: string;
}

type VisualKind = 'pred_vs_actual'|'residuals'|'confusion_matrix'|'roc';

interface VisualPanel {
  id: string;
  runId: string;
  kind: VisualKind;
  maxPoints: number;
  loading?: boolean;
  error?: string;
  visual?: VisualResponse;
}

interface HoverInfo { panelId: string; x: number; y: number; label: string; }
interface PointMapItem { x: number; y: number; data: { x: number; y: number }; }

export default function ModelLabPage() {
  const router = useRouter();
  const { id } = router.query; // dataset id

  // Dataset columns / selection
  const [columns, setColumns] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [problemType, setProblemType] = useState<'auto'|'classification'|'regression'>('auto');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  // Runs
  const [runs, setRuns] = useState<ModelRun[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string|undefined>();
  const pollingRef = useRef<NodeJS.Timeout|undefined>();

  // Visual selection baseline used when auto-adding first panel
  const [visualKind, setVisualKind] = useState<VisualKind>('pred_vs_actual');
  const [maxPoints, setMaxPoints] = useState<number>(1000);

  // Panels
  const [panels, setPanels] = useState<VisualPanel[]>([]);
  const pointMapsRef = useRef<Record<string, PointMapItem[]>>({});
  const [hoverInfo, setHoverInfo] = useState<HoverInfo|null>(null);

  // Fetch columns (preview) once
  useEffect(()=>{
    if(!id) return;
    fetch(`${BACKEND_URL}/dataset/${id}/preview?limit=1`)
      .then(r=>r.json())
      .then(data=>{
        const cols = data?.preview?.columns || [];
        setColumns(cols);
        setSelectedFeatures(cols.filter((c:string)=> c !== target));
      })
      .catch(()=>{});
  },[id]);

  // Fetch runs list
  const loadRuns = () => {
    if(!id) return;
    fetch(`${BACKEND_URL}/datasets/${id}/model/runs`)
      .then(r=>r.json())
      .then(d=>{
        const rs: ModelRun[] = d.runs || [];
        setRuns(rs);
        if(!currentRunId && rs.length>0){
          const latest = rs[0];
            setCurrentRunId(latest.run_id);
        }
      })
      .catch(()=>{});
  };
  useEffect(()=>{ loadRuns(); }, [id]);

  // Poll while any run running
  useEffect(()=>{
    const anyRunning = runs.some(r=>r.status==='running');
    if(anyRunning){
      if(!pollingRef.current){
        pollingRef.current = setInterval(()=> { loadRuns(); }, 1500);
      }
    } else if(pollingRef.current){
      clearInterval(pollingRef.current); pollingRef.current = undefined;
      // After run finishes add panel automatically if none exists
      const latest = runs[0];
      if(latest && panels.length===0 && latest.status==='completed'){
        setPanels([{ id: crypto.randomUUID(), runId: latest.run_id, kind: visualKind, maxPoints, loading:true }]);
      }
    }
    return ()=>{ if(pollingRef.current){ clearInterval(pollingRef.current); pollingRef.current=undefined; } };
  }, [runs.map(r=>r.status).join(','), panels.length]);

  // Submit new model run
  const submit = async () => {
    if(!id || !target) return;
    setSubmitting(true); setMessage('');
    try {
      const payload = {
        target,
        problem_type: problemType,
        include_columns: selectedFeatures,
        test_size: 0.25,
        normalize_numeric: true,
        encode_categoricals: 'auto',
        feature_interactions: true
      };
      const r = await fetch(`${BACKEND_URL}/datasets/${id}/model/runs`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
      const data = await r.json();
      if(!r.ok){ throw new Error(data.detail || 'Run failed to start'); }
      setMessage('Run started');
      loadRuns();
    } catch(e:any){ setMessage(e.message); }
    finally { setSubmitting(false); }
  };

  // Fetch single visual (legacy)
  const fetchVisual = async (runId: string, kind: VisualKind, mp: number, panelId?: string) => {
    try {
      if(panelId){
        setPanels(prev=> prev.map(p=> p.id===panelId ? {...p, loading:true, error: undefined}:p));
      }
      const r = await fetch(`${BACKEND_URL}/datasets/${id}/model/visual`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ run_id: runId, kind, max_points: mp })});
      const data = await r.json();
      if(!r.ok){ throw new Error(data.detail || 'Visual fetch failed'); }
      if(panelId){
        setPanels(prev=> prev.map(p=> p.id===panelId ? {...p, loading:false, visual: data}:p));
      }
    } catch(e:any) {
      if(panelId){
        setPanels(prev=> prev.map(p=> p.id===panelId ? {...p, loading:false, error:e.message}:p));
      } else {
        setMessage(e.message);
      }
    }
  };

  // Allowed kinds given current run
  const currentRun = runs.find(r=>r.run_id===currentRunId);
  const allowedVisualKinds: VisualKind[] = currentRun?.problem_type==='classification' ? ['pred_vs_actual','residuals','confusion_matrix','roc'] : ['pred_vs_actual','residuals'];
  useEffect(()=>{ if(currentRun && !allowedVisualKinds.includes(visualKind)) setVisualKind(allowedVisualKinds[0]); }, [currentRunId]);

  // Panel helpers
  const addPanel = () => { if(!currentRunId) return; setPanels(prev=> [{ id: crypto.randomUUID(), runId: currentRunId, kind: visualKind, maxPoints, loading:true }, ...prev]); };
  const removePanel = (id:string) => setPanels(prev=> prev.filter(p=>p.id!==id));
  const clonePanel = (id:string) => { const p = panels.find(pp=>pp.id===id); if(!p) return; setPanels(prev=> [{...p, id: crypto.randomUUID(), loading:true, visual: undefined}, ...prev]); };

  // Fetch visuals whenever panel config changes
  useEffect(()=>{
    panels.forEach(p => { if(p.runId){ fetchVisual(p.runId, p.kind, p.maxPoints, p.id); } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels.map(p=>p.runId+p.kind+p.maxPoints).join('|')]);

  // Drawing utils
  const drawScatterOrResidual = (canvas: HTMLCanvasElement, v: VisualResponse, panelId: string) => {
    const ctx = canvas.getContext('2d'); if(!ctx) return; const W=canvas.width=400; const H=canvas.height=300; ctx.clearRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H); const PAD_L=50,PAD_R=15,PAD_T=20,PAD_B=45; const plotW=W-PAD_L-PAD_R; const plotH=H-PAD_T-PAD_B;
    let xs: number[] = []; let ys: number[] = [];
    if(v.kind==='pred_vs_actual'){ xs = v.data.actual; ys = v.data.pred; } else { const res = v.data.residuals || []; ys = res; xs = Array.from({length: res.length}, (_,i)=> i); }
    if(!xs || !ys || xs.length===0){ return; }
    const minX = Math.min(...xs), maxX=Math.max(...xs);
    const minY = Math.min(...ys), maxY=Math.max(...ys);
    const sx = (val:number)=> PAD_L + ( (val-minX)/(maxX-minX || 1) ) * plotW;
    const sy = (val:number)=> H-PAD_B - ( (val-minY)/(maxY-minY || 1) ) * plotH;
    ctx.fillStyle='#f8fafc'; ctx.fillRect(PAD_L,PAD_T,plotW,plotH); ctx.strokeStyle='#e2e8f0'; ctx.strokeRect(PAD_L,PAD_T,plotW,plotH);
    ctx.strokeStyle='#e2e8f0'; ctx.beginPath(); for(let i=0;i<=4;i++){ const gx=PAD_L + i*plotW/4; ctx.moveTo(gx,PAD_T); ctx.lineTo(gx,H-PAD_B); const gy=PAD_T + i*plotH/4; ctx.moveTo(PAD_L,gy); ctx.lineTo(W-PAD_R,gy);} ctx.stroke();
    if(v.kind==='pred_vs_actual'){ ctx.setLineDash([4,4]); ctx.strokeStyle='#6366f1'; ctx.beginPath(); ctx.moveTo(sx(minX), sy(minX)); ctx.lineTo(sx(maxX), sy(maxX)); ctx.stroke(); ctx.setLineDash([]); }
    if(v.kind==='residuals' && minY<0 && maxY>0){ const zy=sy(0); ctx.setLineDash([4,4]); ctx.strokeStyle='#6366f1'; ctx.beginPath(); ctx.moveTo(PAD_L, zy); ctx.lineTo(W-PAD_R, zy); ctx.stroke(); ctx.setLineDash([]); }
    const map: PointMapItem[]=[]; ctx.fillStyle='rgba(37,99,235,0.55)'; for(let i=0;i<xs.length;i++){ const x=sx(xs[i]); const y=sy(ys[i]); map.push({x,y,data:{x:xs[i],y:ys[i]}}); ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); }
    pointMapsRef.current[panelId]=map;
    ctx.strokeStyle='#0f172a'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(PAD_L,PAD_T); ctx.lineTo(PAD_L,H-PAD_B); ctx.lineTo(W-PAD_R,H-PAD_B); ctx.stroke();
    ctx.font='11px system-ui'; ctx.fillStyle='#475569'; ctx.textAlign='center'; for(let i=0;i<=4;i++){ const val=minX + (maxX-minX)*i/4; ctx.fillText(val.toPrecision(4), sx(val), H-PAD_B+14);} ctx.textAlign='right'; for(let i=0;i<=4;i++){ const val=minY+(maxY-minY)*i/4; const y=sy(val); ctx.fillText(val.toPrecision(4), PAD_L-6, y+3);} ctx.fillStyle='#0f172a'; ctx.font='12px system-ui'; ctx.textAlign='center'; ctx.fillText(v.kind==='pred_vs_actual'?'Actual vs Predicted':'Residuals', PAD_L+plotW/2, 14);
  };

  // Hover handlers
  const handleCanvasHover = (e: React.MouseEvent<HTMLCanvasElement>, panelId: string) => {
    const rect = e.currentTarget.getBoundingClientRect(); const px = e.clientX-rect.left; const py = e.clientY-rect.top; const pts = pointMapsRef.current[panelId]; if(!pts){ setHoverInfo(null); return; }
    let best=14*14; let nearest: PointMapItem|undefined; for(const p of pts){ const dx=p.x-px; const dy=p.y-py; const d=dx*dx+dy*dy; if(d<best){ best=d; nearest=p; } }
    if(nearest){ setHoverInfo({ panelId, x: nearest.x+8, y: nearest.y+8, label:`(${nearest.data.x.toPrecision(4)}, ${nearest.data.y.toPrecision(4)})`}); } else { setHoverInfo(null); }
  };
  const handleCanvasLeave = ()=> setHoverInfo(null);

  const drawROC = (canvas: HTMLCanvasElement, v: VisualResponse) => {
    const ctx = canvas.getContext('2d'); if(!ctx) return; const W=canvas.width=400; const H=canvas.height=300; const PAD_L=55,PAD_R=20,PAD_T=25,PAD_B=50; ctx.clearRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
    const fpr=v.data.fpr; const tpr=v.data.tpr; ctx.fillStyle='#f8fafc'; ctx.fillRect(PAD_L,PAD_T,W-PAD_L-PAD_R,H-PAD_T-PAD_B); ctx.strokeStyle='#e2e8f0'; ctx.strokeRect(PAD_L,PAD_T,W-PAD_L-PAD_R,H-PAD_T-PAD_B);
    let auc=0; for(let i=1;i<fpr.length;i++){ const dx=fpr[i]-fpr[i-1]; const avg=(tpr[i]+tpr[i-1])/2; auc+=dx*avg; }
    ctx.fillStyle='#c7d2fe88'; ctx.beginPath(); ctx.moveTo(PAD_L,H-PAD_B); for(let i=0;i<fpr.length;i++){ const x=PAD_L+fpr[i]*(W-PAD_L-PAD_R); const y=H-PAD_B - tpr[i]*(H-PAD_T-PAD_B); ctx.lineTo(x,y);} ctx.lineTo(W-PAD_R,H-PAD_B); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#2563eb'; ctx.lineWidth=2; ctx.beginPath(); for(let i=0;i<fpr.length;i++){ const x=PAD_L+fpr[i]*(W-PAD_L-PAD_R); const y=H-PAD_B - tpr[i]*(H-PAD_T-PAD_B); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.stroke();
    ctx.setLineDash([4,4]); ctx.strokeStyle='#6366f1'; ctx.beginPath(); ctx.moveTo(PAD_L,H-PAD_B); ctx.lineTo(W-PAD_R,PAD_T); ctx.stroke(); ctx.setLineDash([]);
    ctx.font='11px system-ui'; ctx.fillStyle='#475569'; ctx.textAlign='center'; ['0','0.25','0.5','0.75','1'].forEach(s=>{ const val=parseFloat(s); const x=PAD_L+val*(W-PAD_L-PAD_R); ctx.fillText(s,x,H-PAD_B+18); });
    ctx.textAlign='right'; ['0','0.25','0.5','0.75','1'].forEach(s=>{ const val=parseFloat(s); const y=H-PAD_B - val*(H-PAD_T-PAD_B); ctx.fillText(s,PAD_L-6,y); });
    ctx.fillStyle='#0f172a'; ctx.font='12px system-ui'; ctx.textAlign='center'; ctx.fillText('FPR', PAD_L+(W-PAD_L-PAD_R)/2, H-15); ctx.save(); ctx.translate(15, PAD_T+(H-PAD_T-PAD_B)/2); ctx.rotate(-Math.PI/2); ctx.fillText('TPR',0,0); ctx.restore(); ctx.font='13px system-ui'; ctx.textAlign='left'; ctx.fillStyle='#111827'; ctx.fillText(`ROC (AUC=${auc.toFixed(3)})`, PAD_L, 16);
  };

  return (
    <div className="relative min-h-screen">
      <CanvasBackground />
      <div className="relative z-10">
        <div className="max-w-7xl mx-auto p-8 space-y-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h1 style={{ color: '#111827' }} className="text-3xl font-bold tracking-tight">Model Lab – Dataset #{id}</h1>
            <button 
              onClick={() => router.push(`/dataset/${id}`)} 
              className="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm hover:bg-gray-800 transition-colors shadow-sm"
            >
              Back to Dataset
            </button>
          </div>
          
          {message && (
            <div className="text-sm px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 shadow-sm">
              {message}
            </div>
          )}
          
          <div className="grid lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white/80 backdrop-blur-sm border rounded-xl p-6 shadow-lg space-y-6">
            <h2 style={{ color: '#111827' }} className="font-semibold text-lg tracking-tight">New Baseline Run</h2>
            <div className="space-y-4">
              <div>
                <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">Target Column</label>
                <select 
                  value={target} 
                  onChange={e=>{ setTarget(e.target.value); setSelectedFeatures(columns.filter(c=>c!==e.target.value)); }} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                  style={{ color: '#111827' }}
                >
                  <option value="">-- Select Target Column --</option>
                  {columns.map(c=> <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              
              <div>
                <label style={{ color: '#374151' }} className="block text-sm font-medium mb-3">Problem Type</label>
                <select 
                  value={problemType} 
                  onChange={e=>setProblemType(e.target.value as any)} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                  style={{ color: '#111827' }}
                >
                  <option value="auto">Auto-Detect</option>
                  <option value="classification">Classification</option>
                  <option value="regression">Regression</option>
                </select>
              </div>
              
              <div className="flex gap-3">
                <button 
                  disabled={!target || submitting} 
                  onClick={submit} 
                  className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md text-sm"
                >
                  {submitting ? (
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Training...
                    </div>
                  ) : (
                    'Train Model'
                  )}
                </button>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={()=>setSelectedFeatures(columns.filter(c=>c!==target))} 
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                  style={{ color: '#374151' }}
                >
                  Select All Features
                </button>
                <button 
                  onClick={()=>setSelectedFeatures([])} 
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                  style={{ color: '#374151' }}
                >
                  Clear Features
                </button>
              </div>
              
              <p style={{ color: '#9ca3af' }} className="text-xs">
                Auto-detect chooses classification for low-cardinality targets, otherwise regression. 
                Features selected: <span className="font-semibold">{selectedFeatures.length}</span>
              </p>
            </div>
          </div>
          
          <div className="bg-white/80 backdrop-blur-sm border rounded-xl p-6 shadow-lg space-y-6">
            <div className="flex items-center justify-between">
              <h2 style={{ color: '#111827' }} className="font-semibold text-lg tracking-tight">
                Model Runs <span style={{ color: '#6b7280' }} className="text-sm font-normal">({runs.length})</span>
              </h2>
              <button 
                disabled={!currentRunId} 
                onClick={addPanel} 
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                Add Panel
              </button>
            </div>
            
            {runs.length === 0 && (
              <div className="text-center py-8">
                <p style={{ color: '#6b7280' }} className="text-sm">No model runs yet. Train your first model above.</p>
              </div>
            )}
            
            <div className="space-y-3 max-h-[520px] overflow-auto">
              {runs.map(r => (
                <div 
                  key={r.run_id} 
                  className={`border rounded-lg p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${
                    r.run_id===currentRunId 
                      ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200' 
                      : 'bg-white hover:bg-gray-50'
                  }`} 
                  onClick={()=>setCurrentRunId(r.run_id)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span style={{ color: '#111827' }} className="font-semibold text-sm">{r.problem_type.toUpperCase()}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${
                        r.status==='completed' ? 'bg-emerald-600' : 
                        r.status==='failed' ? 'bg-red-600' : 
                        'bg-gray-700'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                    <span style={{ color: '#9ca3af' }} className="text-xs">
                      {new Date(r.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  
                  <div className="space-y-1">
                    <p style={{ color: '#6b7280' }} className="text-sm">
                      <span className="font-medium">Target:</span> {r.target}
                    </p>
                    {r.metrics && (
                      <p style={{ color: '#6b7280' }} className="text-sm">
                        <span className="font-medium">{r.metrics.metric_primary}:</span> {r.metrics.metric_value.toFixed(4)}
                      </p>
                    )}
                    {r.message && (
                      <p style={{ color: '#dc2626' }} className="text-xs mt-2">{r.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/80 backdrop-blur-sm border rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 style={{ color: '#111827' }} className="font-semibold text-lg tracking-tight">Visualization Panels</h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label style={{ color: '#6b7280' }} className="text-sm font-medium">Panel Type:</label>
                  <select 
                    value={visualKind} 
                    onChange={e=>setVisualKind(e.target.value as VisualKind)} 
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                    style={{ color: '#111827' }}
                  >
                    {allowedVisualKinds.map(k=> <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                {(visualKind==='pred_vs_actual'||visualKind==='residuals') && (
                  <div className="flex items-center gap-2">
                    <label style={{ color: '#6b7280' }} className="text-sm font-medium">Max Points:</label>
                    <input 
                      type="number" 
                      value={maxPoints} 
                      onChange={e=> setMaxPoints(Number(e.target.value)||500)} 
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-sm font-medium shadow-sm"
                      style={{ color: '#111827' }}
                      placeholder="1000"
                    />
                  </div>
                )}
                <button 
                  onClick={addPanel} 
                  disabled={!currentRunId} 
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  Add Panel
                </button>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {panels.map(p => {
              const run = runs.find(r=>r.run_id===p.runId);
              const runKinds: VisualKind[] = run?.problem_type==='classification' ? ['pred_vs_actual','residuals','confusion_matrix','roc'] : ['pred_vs_actual','residuals'];
              return (
                <div key={p.id} className="relative border rounded bg-gray-50 p-2 flex flex-col gap-2 text-[10px] shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={p.runId} onChange={e=> setPanels(prev=> prev.map(pp=>pp.id===p.id?{...pp, runId:e.target.value, visual: undefined, loading:true}:pp))} className="border rounded px-1 py-0.5 text-[10px] flex-1 min-w-[120px]">
                      {runs.filter(r=>r.status==='completed').map(r=> <option key={r.run_id} value={r.run_id}>{r.metrics?.metric_primary}:{r.metrics?.metric_value.toFixed(3)} • {r.problem_type}</option>)}
                    </select>
                    <select value={p.kind} onChange={e=> setPanels(prev=> prev.map(pp=>pp.id===p.id?{...pp, kind:e.target.value as VisualKind, visual: undefined, loading:true}:pp))} className="border rounded px-1 py-0.5 text-[10px]">
                      {runKinds.map(k=> <option key={k} value={k}>{k}</option>)}
                    </select>
                    {(p.kind==='pred_vs_actual' || p.kind==='residuals') && (
                      <input title="Max Points" type="number" value={p.maxPoints} onChange={e=> setPanels(prev=> prev.map(pp=>pp.id===p.id?{...pp, maxPoints:Number(e.target.value)||500, visual: undefined, loading:true}:pp))} className="border rounded px-1 py-0.5 w-16" />
                    )}
                    <div className="ml-auto flex gap-1">
                      <button onClick={()=>clonePanel(p.id)} className="px-2 py-0.5 border rounded bg-white">Clone</button>
                      <button onClick={()=>removePanel(p.id)} className="px-2 py-0.5 border rounded bg-white text-red-600">X</button>
                    </div>
                  </div>
                  {p.loading && <div className="text-[10px] text-gray-500">Loading...</div>}
                  {p.error && <div className="text-[10px] text-red-600">{p.error}</div>}
                  {p.visual && (
                    <div className="relative">
                      {(p.visual.kind==='pred_vs_actual' || p.visual.kind==='residuals') && (
                        <canvas
                          onMouseMove={(e)=>handleCanvasHover(e,p.id)}
                          onMouseLeave={handleCanvasLeave}
                          ref={el=>{ if(el) drawScatterOrResidual(el, p.visual!, p.id); }}
                          className="border rounded bg-white"
                        />
                      )}
                      {p.visual.kind==='confusion_matrix' && (
                        <div className="overflow-auto">
                          {(() => {
                            const labels = p.visual!.data.labels as string[];
                            const matrix = p.visual!.data.matrix as number[][];
                            const maxVal = Math.max(...matrix.flat());
                            const colorFor = (v:number)=> `rgba(99,102,241,${maxVal? (0.15 + 0.75*v/maxVal):0.15})`;
                            return (
                              <table className="text-[10px] border-collapse">
                                <thead>
                                  <tr><th></th>{labels.map(l=> <th key={l} className="px-2 py-1 border bg-gray-100">Pred {l}</th>)}</tr>
                                </thead>
                                <tbody>
                                  {matrix.map((row,i)=>(
                                    <tr key={i}>
                                      <th className="px-2 py-1 border bg-gray-100 text-left">Actual {labels[i]}</th>
                                      {row.map((v,j)=> <td key={j} style={{backgroundColor:colorFor(v)}} className="px-2 py-1 border text-right font-mono">{v}</td>)}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            );
                          })()}
                        </div>
                      )}
                      {p.visual.kind==='roc' && (
                        <canvas ref={el=>{ if(el) drawROC(el, p.visual!); }} className="border rounded bg-white" />
                      )}
                      {hoverInfo && hoverInfo.panelId===p.id && (
                        <div style={{left:hoverInfo.x, top:hoverInfo.y}} className="pointer-events-none absolute z-10 -translate-y-2 translate-x-2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow">
                          {hoverInfo.label}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
            
            {panels.length===0 && (
              <div className="text-center py-12">
                <p style={{ color: '#6b7280' }} className="text-sm">
                  No panels yet. When a run completes, a panel is auto-added or click "Add Panel".
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
    </div>
  );
}
