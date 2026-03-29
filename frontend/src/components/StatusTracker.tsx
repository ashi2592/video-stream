import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { formatStatus, getStatusColor } from '../utils/formatStatus';
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react';

interface StatusTrackerProps {
  status: 'idle' | 'queued' | 'processing' | 'success' | 'failed';
  progress: number;
  taskId: string | null;
  error: string | null;
  onReset: () => void;
}

export function StatusTracker({ status, progress, taskId, error, onReset }: StatusTrackerProps) {
  if (status === 'idle') return null;

  return (
    <Card className="border-slate-200 shadow-lg">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            {/* Status Indicator */}
            <div className={`w-3 h-3 rounded-full ${getStatusColor(status)}`} />
            
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-slate-800">{formatStatus(status)}</p>
                {taskId && (
                  <p className="text-xs text-slate-500 font-mono">ID: {taskId}</p>
                )}
              </div>
              
              {/* Progress Bar */}
              {status !== 'success' && status !== 'failed' && (
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getStatusColor(status)} transition-all duration-500`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-4">
            {status === 'success' && (
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Complete</span>
              </div>
            )}
            
            {status === 'failed' && (
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Failed</span>
              </div>
            )}

            {(status === 'success' || status === 'failed') && (
              <Button
                onClick={onReset}
                variant="outline"
                size="sm"
                className="ml-4 border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                New Upload
              </Button>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}