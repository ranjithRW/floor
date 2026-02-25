import { useState, useEffect } from 'react';
import { Building2, History, Plus } from 'lucide-react';
import { supabase, type Project, type FloorPlan, type Render } from './lib/supabase';
import { UploadFloorPlan } from './components/UploadFloorPlan';
import { RenderResults } from './components/RenderResults';
import {
  analyzeFloorPlan,
  generateIsometricView,
  generateRoomRender,
} from './services/openai';

interface ProjectWithDetails extends Project {
  floorPlan?: FloorPlan;
  renders: Render[];
}

function App() {
  const [view, setView] = useState<'upload' | 'results' | 'history'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProject, setCurrentProject] = useState<ProjectWithDetails | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectWithDetails[]>([]);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    loadRecentProjects();
  }, []);

  const loadRecentProjects = async () => {
    try {
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (projectsError) throw projectsError;

      if (projects) {
        const projectsWithDetails = await Promise.all(
          projects.map(async (project) => {
            const { data: floorPlans } = await supabase
              .from('floor_plans')
              .select('*')
              .eq('project_id', project.id)
              .limit(1)
              .maybeSingle();

            const { data: renders } = await supabase
              .from('renders')
              .select('*')
              .eq('floor_plan_id', floorPlans?.id || '')
              .order('created_at', { ascending: true });

            return {
              ...project,
              floorPlan: floorPlans || undefined,
              renders: renders || [],
            };
          })
        );

        setRecentProjects(projectsWithDetails);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const handleUpload = async (file: File, projectName: string) => {
    setIsProcessing(true);
    setStatusMessage('Creating project...');

    try {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: projectName,
          description: 'AI-generated 3D visualization',
        })
        .select()
        .single();

      if (projectError) throw projectError;

      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64String = (reader.result as string).split(',')[1];

          const imageUrl = reader.result as string;

          setStatusMessage('Saving floor plan...');

          const { data: floorPlan, error: floorPlanError } = await supabase
            .from('floor_plans')
            .insert({
              project_id: project.id,
              original_filename: file.name,
              file_url: imageUrl,
              file_size: file.size,
            })
            .select()
            .single();

          if (floorPlanError) throw floorPlanError;

          setStatusMessage('Analyzing floor plan with AI...');

          const rooms = await analyzeFloorPlan(base64String);

          setStatusMessage('Generating 3D isometric view...');

          const isometricPrompt = `3D isometric architectural visualization of ${projectName}`;
          const { data: isometricRender, error: isometricError } = await supabase
            .from('renders')
            .insert({
              floor_plan_id: floorPlan.id,
              render_type: 'isometric',
              prompt_used: isometricPrompt,
              status: 'processing',
            })
            .select()
            .single();

          if (isometricError) throw isometricError;

          setStatusMessage(`Generating ${rooms.length} room renders...`);

          const roomRenderPromises = rooms.map((room) =>
            supabase
              .from('renders')
              .insert({
                floor_plan_id: floorPlan.id,
                render_type: 'room_wise',
                room_name: room,
                prompt_used: `3D interior render of ${room}`,
                status: 'processing',
              })
              .select()
              .single()
          );

          const roomRenderResults = await Promise.all(roomRenderPromises);

          const projectWithDetails: ProjectWithDetails = {
            ...project,
            floorPlan,
            renders: [
              isometricRender,
              ...roomRenderResults.map((r) => r.data).filter(Boolean),
            ] as Render[],
          };

          setCurrentProject(projectWithDetails);
          setView('results');

          generateIsometricView({ imageBase64: base64String, projectName })
            .then(async (imageUrl) => {
              await supabase
                .from('renders')
                .update({
                  image_url: imageUrl,
                  status: 'completed',
                  completed_at: new Date().toISOString(),
                })
                .eq('id', isometricRender.id);

              loadCurrentProject(project.id);
            })
            .catch(async (error) => {
              console.error('Error generating isometric view:', error);
              await supabase
                .from('renders')
                .update({
                  status: 'failed',
                  error_message: error.message,
                })
                .eq('id', isometricRender.id);

              loadCurrentProject(project.id);
            });

          roomRenderResults.forEach((result, index) => {
            if (result.data) {
              generateRoomRender({
                imageBase64: base64String,
                roomName: rooms[index],
              })
                .then(async (imageUrl) => {
                  await supabase
                    .from('renders')
                    .update({
                      image_url: imageUrl,
                      status: 'completed',
                      completed_at: new Date().toISOString(),
                    })
                    .eq('id', result.data.id);

                  loadCurrentProject(project.id);
                })
                .catch(async (error) => {
                  console.error('Error generating room render:', error);
                  await supabase
                    .from('renders')
                    .update({
                      status: 'failed',
                      error_message: error.message,
                    })
                    .eq('id', result.data.id);

                  loadCurrentProject(project.id);
                });
            }
          });

          setStatusMessage('');
          setIsProcessing(false);
        } catch (error) {
          console.error('Error processing upload:', error);
          setStatusMessage('Error: ' + (error as Error).message);
          setIsProcessing(false);
        }
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error creating project:', error);
      setStatusMessage('Error: ' + (error as Error).message);
      setIsProcessing(false);
    }
  };

  const loadCurrentProject = async (projectId: string) => {
    try {
      const { data: project } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (project) {
        const { data: floorPlan } = await supabase
          .from('floor_plans')
          .select('*')
          .eq('project_id', project.id)
          .limit(1)
          .maybeSingle();

        const { data: renders } = await supabase
          .from('renders')
          .select('*')
          .eq('floor_plan_id', floorPlan?.id || '')
          .order('created_at', { ascending: true });

        setCurrentProject({
          ...project,
          floorPlan: floorPlan || undefined,
          renders: renders || [],
        });
      }
    } catch (error) {
      console.error('Error loading project:', error);
    }
  };

  const handleDownload = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  };

  const handleNewProject = () => {
    setCurrentProject(null);
    setView('upload');
    setStatusMessage('');
  };

  const handleViewProject = (project: ProjectWithDetails) => {
    setCurrentProject(project);
    setView('results');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50">
      <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Building2 className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Architectural Visualizer Pro
                </h1>
                <p className="text-sm text-gray-600">
                  25 Years of Excellence in Spatial Planning
                </p>
              </div>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={handleNewProject}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
              >
                <Plus className="w-5 h-5" />
                <span>New Project</span>
              </button>
              <button
                onClick={() => {
                  setView('history');
                  loadRecentProjects();
                }}
                className="flex items-center space-x-2 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all"
              >
                <History className="w-5 h-5" />
                <span>History</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {statusMessage && (
          <div className="mb-8 bg-blue-50 border-2 border-blue-200 rounded-lg p-4 text-center">
            <p className="text-blue-700 font-medium">{statusMessage}</p>
          </div>
        )}

        {view === 'upload' && (
          <UploadFloorPlan onUpload={handleUpload} isProcessing={isProcessing} />
        )}

        {view === 'results' && currentProject && (
          <RenderResults
            renders={currentProject.renders}
            projectName={currentProject.name}
            floorPlan={currentProject.floorPlan}
            onDownload={handleDownload}
          />
        )}

        {view === 'history' && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Project History</h2>
            {recentProjects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {recentProjects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => handleViewProject(project)}
                    className="border-2 border-gray-200 rounded-xl p-4 hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all"
                  >
                    <div className="aspect-video bg-gray-100 rounded-lg mb-4 overflow-hidden">
                      {project.floorPlan?.file_url ? (
                        <img
                          src={project.floorPlan.file_url}
                          alt={project.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Building2 className="w-12 h-12 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">{project.name}</h3>
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>
                        {project.renders.filter((r) => r.status === 'completed').length} /{' '}
                        {project.renders.length} renders
                      </span>
                      <span>
                        {new Date(project.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No projects yet. Create your first one!</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
