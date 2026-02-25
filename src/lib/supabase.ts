import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface FloorPlan {
  id: string;
  project_id: string;
  original_filename: string;
  file_url: string;
  file_size: number;
  width: number | null;
  height: number | null;
  uploaded_at: string;
}

export interface Render {
  id: string;
  floor_plan_id: string;
  render_type: 'isometric' | 'room_wise';
  room_name: string | null;
  image_url: string | null;
  prompt_used: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}
