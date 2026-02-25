import { useState } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';

interface UploadFloorPlanProps {
  onUpload: (file: File, projectName: string) => void;
  isProcessing: boolean;
}

export function UploadFloorPlan({ onUpload, isProcessing }: UploadFloorPlanProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFile && projectName.trim()) {
      onUpload(selectedFile, projectName.trim());
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-lg p-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Upload Your 2D Floor Plan
        </h2>
        <p className="text-gray-600">
          Transform your floor plan into stunning 3D visualizations
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-2">
            Project Name
          </label>
          <input
            id="projectName"
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="e.g., Modern Villa, Downtown Apartment"
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            required
            disabled={isProcessing}
          />
        </div>

        <div
          className={`relative border-2 border-dashed rounded-xl transition-all ${
            dragActive
              ? 'border-blue-500 bg-blue-50'
              : preview
              ? 'border-green-500 bg-green-50'
              : 'border-gray-300 hover:border-gray-400'
          } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            id="file-upload"
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleChange}
            disabled={isProcessing}
          />

          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center py-12 cursor-pointer"
          >
            {preview ? (
              <div className="space-y-4">
                <img
                  src={preview}
                  alt="Floor plan preview"
                  className="max-h-96 rounded-lg shadow-md"
                />
                <div className="flex items-center justify-center space-x-2 text-green-600">
                  <ImageIcon className="w-5 h-5" />
                  <span className="font-medium">{selectedFile?.name}</span>
                </div>
              </div>
            ) : (
              <>
                <Upload className="w-16 h-16 text-gray-400 mb-4" />
                <p className="text-lg font-medium text-gray-700 mb-2">
                  Drop your floor plan here or click to browse
                </p>
                <p className="text-sm text-gray-500">
                  Supports PNG, JPG, JPEG (Max 10MB)
                </p>
              </>
            )}
          </label>
        </div>

        <button
          type="submit"
          disabled={!selectedFile || !projectName.trim() || isProcessing}
          className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-semibold text-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {isProcessing ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Processing...
            </span>
          ) : (
            'Generate 3D Visualizations'
          )}
        </button>
      </form>
    </div>
  );
}
