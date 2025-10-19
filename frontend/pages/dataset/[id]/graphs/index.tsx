import { useRouter } from 'next/router';
import Link from 'next/link';
import GraphBuilder from '../../../../components/GraphBuilder';
import CanvasBackground from '../../../../components/CanvasBackground';

export default function GraphsPage() {
  const router = useRouter();
  const { id } = router.query;

  return (
    <div className="relative min-h-screen">
      <CanvasBackground />
      <div className="relative z-10">
        <div className="max-w-7xl mx-auto p-8 space-y-12">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h1 style={{ color: '#111827' }} className="text-3xl font-bold tracking-tight">Graphs for Dataset #{id}</h1>
            <div className="flex items-center gap-3">
              <Link 
                href={`/dataset/${id}`} 
                className="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm hover:bg-gray-800 transition-colors shadow-sm"
              >
                Back to Dataset
              </Link>
            </div>
          </div>
          
          <div className="bg-white/80 backdrop-blur-sm border rounded-xl p-8 shadow-lg">
            <GraphBuilder datasetId={id} />
          </div>
          
          <div className="text-center">
            <p style={{ color: '#6b7280' }} className="text-sm">
              Graphs render from the current cleaned data. Re-run operations on the dataset page to update underlying values, then refresh here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
