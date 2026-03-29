import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Upload, FileVideo } from 'lucide-react';
import type { OverlayConfig } from '../types';

interface VideoUploadFormProps {
  overlay: OverlayConfig;
  onOverlayChange: (overlay: OverlayConfig) => void;
  onUpload: (file: File) => void;
  isUploading: boolean;
}

export function VideoUploadForm({ overlay, onOverlayChange, onUpload, isUploading }: VideoUploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('video/')) {
      setFile(droppedFile);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file) {
      onUpload(file);
    }
  };

  return (
    <Card className="h-full border-slate-200 shadow-lg">
      <CardHeader className="bg-slate-50 border-b border-slate-200">
        <CardTitle className="text-slate-800 flex items-center gap-2">
          <FileVideo className="w-5 h-5 text-blue-600" />
          Video Upload
        </CardTitle>
        <CardDescription className="text-slate-600">
          Upload your video and customize the broadcast overlay
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* File Upload */}
        <div
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isUploading}
          />
          <Upload className={`w-12 h-12 mx-auto mb-3 ${isDragging ? 'text-blue-500' : 'text-slate-400'}`} />
          {file ? (
            <div>
              <p className="font-medium text-slate-800">{file.name}</p>
              <p className="text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          ) : (
            <div>
              <p className="font-medium text-slate-700">Drop video here or click to browse</p>
              <p className="text-sm text-slate-500 mt-1">MP4, MOV, AVI up to 500MB</p>
            </div>
          )}
        </div>

        {/* Overlay Toggle */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
          <div>
            <Label className="font-medium text-slate-800">Enable Overlay</Label>
            <p className="text-sm text-slate-500">Show broadcast-style graphics on video</p>
          </div>
          <button
            type="button"
            onClick={() => onOverlayChange({ ...overlay, enabled: !overlay.enabled })}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              overlay.enabled ? 'bg-blue-600' : 'bg-slate-300'
            }`}
            disabled={isUploading}
          >
            <span
              className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                overlay.enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Overlay Fields */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="channel" className="text-slate-700 font-medium">Channel Name</Label>
            <Input
              id="channel"
              value={overlay.channelName}
              onChange={(e) => onOverlayChange({ ...overlay, channelName: e.target.value })}
              disabled={isUploading}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="headline" className="text-slate-700 font-medium">Headline</Label>
            <Input
              id="headline"
              value={overlay.headline}
              onChange={(e) => onOverlayChange({ ...overlay, headline: e.target.value })}
              disabled={isUploading}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="ticker" className="text-slate-700 font-medium">Ticker Text</Label>
            <Input
              id="ticker"
              value={overlay.ticker}
              onChange={(e) => onOverlayChange({ ...overlay, ticker: e.target.value })}
              disabled={isUploading}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="badge" className="text-slate-700 font-medium">Badge Text</Label>
            <Input
              id="badge"
              value={overlay.badgeText}
              onChange={(e) => onOverlayChange({ ...overlay, badgeText: e.target.value })}
              disabled={isUploading}
              className="mt-1"
            />
          </div>
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={!file || isUploading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-6"
        >
          {isUploading ? 'Publishing...' : 'Publish Video'}
        </Button>
      </CardContent>
    </Card>
  );
}