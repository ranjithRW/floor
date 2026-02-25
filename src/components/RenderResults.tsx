import { useState } from 'react';
import { Download, Grid3x3, Home, CheckCircle, Loader, XCircle, Image as ImageIcon } from 'lucide-react';
import type { Render, FloorPlan } from '../lib/supabase';

interface RenderResultsProps {
  renders: Render[];
  projectName: string;
  floorPlan?: FloorPlan;
  onDownload: (imageUrl: string, filename: string) => void;
}

export function RenderResults({ renders, projectName, floorPlan, onDownload }: RenderResultsProps) {
  const [selectedView, setSelectedView] = useState<'floorplan' | 'isometric' | 'rooms'>('floorplan');

  const isometricRender = renders.find((r) => r.render_type === 'isometric');
  const roomRenders = renders.filter((r) => r.render_type === 'room_wise');

  const getStatusIcon = (status: Render['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'processing':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Loader className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: Render['status']) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'processing':
        return 'Generating...';
      case 'failed':
        return 'Failed';
      default:
        return 'Pending';
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto bg-white rounded-2xl shadow-lg p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">{projectName}</h2>
        <p className="text-gray-600">3D Architectural Visualizations</p>
      </div>

      <div className="flex space-x-4 mb-8 border-b border-gray-200">
        <button
          onClick={() => setSelectedView('floorplan')}
          className={`flex items-center space-x-2 px-6 py-3 font-medium transition-all ${
            selectedView === 'floorplan'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ImageIcon className="w-5 h-5" />
          <span>Original Floor Plan</span>
        </button>
        <button
          onClick={() => setSelectedView('isometric')}
          className={`flex items-center space-x-2 px-6 py-3 font-medium transition-all ${
            selectedView === 'isometric'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Grid3x3 className="w-5 h-5" />
          <span>3D Isometric View</span>
        </button>
        <button
          onClick={() => setSelectedView('rooms')}
          className={`flex items-center space-x-2 px-6 py-3 font-medium transition-all ${
            selectedView === 'rooms'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Home className="w-5 h-5" />
          <span>Room-Wise Renders ({roomRenders.length})</span>
        </button>
      </div>

      {selectedView === 'floorplan' && (
        <div className="space-y-6">
          {floorPlan ? (
            <div className="relative group">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <ImageIcon className="w-5 h-5 text-green-500" />
                  <span className="text-lg font-semibold text-gray-900">
                    Original Floor Plan
                  </span>
                </div>
                {floorPlan.file_url && (
                  <button
                    onClick={() =>
                      onDownload(
                        floorPlan.file_url,
                        `${projectName}-floorplan.png`
                      )
                    }
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </button>
                )}
              </div>

              <img
                src={floorPlan.file_url}
                alt="Original Floor Plan"
                className="w-full rounded-xl shadow-2xl"
              />
            </div>
          ) : (
            <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-12 text-center">
              <p className="text-gray-600">No floor plan available</p>
            </div>
          )}
        </div>
      )}

      {selectedView === 'isometric' && (
        <div className="space-y-6">
          {isometricRender ? (
            <div className="relative group">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(isometricRender.status)}
                  <span className="text-lg font-semibold text-gray-900">
                    {getStatusText(isometricRender.status)}
                  </span>
                </div>
                {isometricRender.status === 'completed' && isometricRender.image_url && (
                  <button
                    onClick={() =>
                      onDownload(
                        isometricRender.image_url!,
                        `${projectName}-isometric.png`
                      )
                    }
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </button>
                )}
              </div>

              {isometricRender.status === 'completed' && isometricRender.image_url ? (
                <img
                  src={isometricRender.image_url}
                  alt="3D Isometric View"
                  className="w-full rounded-xl shadow-2xl"
                />
              ) : isometricRender.status === 'failed' ? (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-8 text-center">
                  <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                  <p className="text-red-700 font-medium">
                    {isometricRender.error_message || 'Failed to generate isometric view'}
                  </p>
                </div>
              ) : (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-12 text-center">
                  <Loader className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
                  <p className="text-blue-700 font-medium text-lg">
                    Generating your 3D isometric visualization...
                  </p>
                  <p className="text-blue-600 text-sm mt-2">This may take 30-60 seconds</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-12 text-center">
              <p className="text-gray-600">No isometric view available</p>
            </div>
          )}
        </div>
      )}

      {selectedView === 'rooms' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {roomRenders.length > 0 ? (
            roomRenders.map((render) => (
              <div
                key={render.id}
                className="bg-gray-50 rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-shadow"
              >
                <div className="p-4 bg-white border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(render.status)}
                      <h3 className="font-semibold text-gray-900">{render.room_name}</h3>
                    </div>
                    {render.status === 'completed' && render.image_url && (
                      <button
                        onClick={() =>
                          onDownload(
                            render.image_url!,
                            `${projectName}-${render.room_name}.png`
                          )
                        }
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{getStatusText(render.status)}</p>
                </div>

                <div className="aspect-video bg-gray-100">
                  {render.status === 'completed' && render.image_url ? (
                    <img
                      src={render.image_url}
                      alt={render.room_name || 'Room render'}
                      className="w-full h-full object-cover"
                    />
                  ) : render.status === 'failed' ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <XCircle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                        <p className="text-red-600 text-sm px-4">
                          {render.error_message || 'Generation failed'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Loader className="w-12 h-12 text-blue-500 mx-auto mb-2 animate-spin" />
                        <p className="text-blue-600 text-sm">Generating...</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-2 bg-gray-50 border-2 border-gray-200 rounded-xl p-12 text-center">
              <p className="text-gray-600">No room renders available</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
