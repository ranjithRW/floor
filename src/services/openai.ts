const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn('OpenAI API key not found in environment variables');
}

export interface GenerateIsometricParams {
  imageBase64: string;
  projectName: string;
}

export interface GenerateRoomRenderParams {
  imageBase64: string;
  roomName: string;
  roomDescription?: string;
}

export async function analyzeFloorPlan(imageBase64: string): Promise<string[]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured');
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'As a senior architectural visualization director with 25 years of experience in spatial planning and real estate, analyze this 2D floor plan and identify all distinct rooms. List each room name separately (e.g., Living Room, Master Bedroom, Kitchen, Bathroom, etc.). Return ONLY a JSON array of room names, nothing else.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to analyze floor plan');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Clean the content in case it's wrapped in markdown code blocks
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith('```json')) {
      cleanedContent = cleanedContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const rooms = JSON.parse(cleanedContent);
    return Array.isArray(rooms) ? rooms : [];
  } catch (error) {
    console.error('Error analyzing floor plan:', error);
    throw error;
  }
}

export async function generateIsometricView(params: GenerateIsometricParams): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured');
  }

  const prompt = `Create a professional 3D isometric architectural visualization of this floor plan for "${params.projectName}".

As a 25-year experienced senior architectural visualization director specializing in spatial planning and real estate, render this with:
- Clean, modern 3D isometric perspective (45-degree angle)
- Realistic materials and textures (wood floors, tile, carpets)
- Professional lighting with soft shadows
- Detailed furniture and fixtures appropriate for each space
- Accurate spatial proportions and relationships
- High-end architectural visualization quality
- Warm, inviting atmosphere suitable for real estate presentation
- Show walls with proper thickness and room divisions clearly

Style: Photorealistic architectural rendering, professional real estate marketing quality.`;

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1792x1024',
        quality: 'hd',
        style: 'natural',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to generate isometric view');
    }

    const data = await response.json();
    return data.data[0].url;
  } catch (error) {
    console.error('Error generating isometric view:', error);
    throw error;
  }
}

export async function generateRoomRender(params: GenerateRoomRenderParams): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured');
  }

  const prompt = `Create a stunning photorealistic 3D interior render of a ${params.roomName}${params.roomDescription ? ` (${params.roomDescription})` : ''}.

As a 25-year experienced senior architectural visualization director in spatial planning and real estate, create:
- Photorealistic 3D interior perspective view
- High-end interior design with contemporary aesthetics
- Professional lighting setup (natural and artificial light)
- Realistic materials: hardwood/tile floors, painted walls, quality finishes
- Appropriate furniture and decor for a ${params.roomName}
- Accurate scale and proportions
- Warm, inviting atmosphere
- Camera angle at eye level (5.5 feet height)
- Suitable for luxury real estate marketing
- Ray-traced lighting with soft shadows and realistic reflections

Style: Ultra-realistic architectural interior visualization, magazine-quality photography look.`;

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1792x1024',
        quality: 'hd',
        style: 'natural',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to generate room render');
    }

    const data = await response.json();
    return data.data[0].url;
  } catch (error) {
    console.error('Error generating room render:', error);
    throw error;
  }
}
