export function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    queued: 'Queued for processing...',
    processing: 'Processing video...',
    success: 'Ready to view!',
    failed: 'Processing failed'
  };
  return statusMap[status] || status;
}

export function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    queued: 'bg-amber-500',
    processing: 'bg-blue-500',
    success: 'bg-emerald-500',
    failed: 'bg-red-500'
  };
  return colorMap[status] || 'bg-gray-500';
}