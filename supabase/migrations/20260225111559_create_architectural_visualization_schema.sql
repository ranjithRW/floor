/*
  # Architectural Visualization Platform Schema

  ## Overview
  This migration creates the database structure for an architectural visualization platform
  that converts 2D floor plans into 3D isometric views and room-wise renders.

  ## New Tables
  
  ### `projects`
  Stores project information and metadata
  - `id` (uuid, primary key) - Unique project identifier
  - `user_id` (uuid) - Reference to auth.users (future use)
  - `name` (text) - Project name
  - `description` (text, nullable) - Project description
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp
  
  ### `floor_plans`
  Stores uploaded 2D floor plan images
  - `id` (uuid, primary key) - Unique floor plan identifier
  - `project_id` (uuid, foreign key) - Reference to projects table
  - `original_filename` (text) - Original uploaded filename
  - `file_url` (text) - URL to stored image file
  - `file_size` (integer) - File size in bytes
  - `width` (integer, nullable) - Image width in pixels
  - `height` (integer, nullable) - Image height in pixels
  - `uploaded_at` (timestamptz) - Upload timestamp
  
  ### `renders`
  Stores generated 3D renders (isometric and room-wise)
  - `id` (uuid, primary key) - Unique render identifier
  - `floor_plan_id` (uuid, foreign key) - Reference to floor_plans table
  - `render_type` (text) - Type: 'isometric' or 'room_wise'
  - `room_name` (text, nullable) - Room name for room_wise renders
  - `image_url` (text) - URL to rendered image
  - `prompt_used` (text) - AI prompt used for generation
  - `status` (text) - Status: 'pending', 'processing', 'completed', 'failed'
  - `error_message` (text, nullable) - Error message if failed
  - `created_at` (timestamptz) - Creation timestamp
  - `completed_at` (timestamptz, nullable) - Completion timestamp

  ## Security
  - Enable RLS on all tables
  - Allow public access for demo purposes (can be restricted later with auth)
  
  ## Notes
  - All timestamps use timestamptz for timezone awareness
  - Foreign keys ensure referential integrity
  - Indexes added for common query patterns
*/

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create floor_plans table
CREATE TABLE IF NOT EXISTS floor_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  file_url text NOT NULL,
  file_size integer DEFAULT 0,
  width integer,
  height integer,
  uploaded_at timestamptz DEFAULT now()
);

-- Create renders table
CREATE TABLE IF NOT EXISTS renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id uuid NOT NULL REFERENCES floor_plans(id) ON DELETE CASCADE,
  render_type text NOT NULL CHECK (render_type IN ('isometric', 'room_wise')),
  room_name text,
  image_url text,
  prompt_used text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_floor_plans_project_id ON floor_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_renders_floor_plan_id ON renders(floor_plan_id);
CREATE INDEX IF NOT EXISTS idx_renders_status ON renders(status);

-- Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE renders ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for demo (allow all operations)
-- These can be restricted later when authentication is added
CREATE POLICY "Allow public read access to projects"
  ON projects FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert to projects"
  ON projects FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public update to projects"
  ON projects FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete to projects"
  ON projects FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to floor_plans"
  ON floor_plans FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert to floor_plans"
  ON floor_plans FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public update to floor_plans"
  ON floor_plans FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete to floor_plans"
  ON floor_plans FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to renders"
  ON renders FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert to renders"
  ON renders FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public update to renders"
  ON renders FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete to renders"
  ON renders FOR DELETE
  TO anon, authenticated
  USING (true);