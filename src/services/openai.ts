const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn('OpenAI API key not found in environment variables');
}

export interface GenerateIsometricParams {
  imageDataUrl: string;
  projectName: string;
}

export interface GenerateRoomRenderParams {
  imageDataUrl: string;
  roomName: string;
  roomDescription?: string;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out while generating image. Please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function dataUrlToImageFile(imageDataUrl: string): Promise<File> {
  const response = await fetch(imageDataUrl);
  const blob = await response.blob();
  const extension = blob.type.includes('jpeg') || blob.type.includes('jpg') ? 'jpg' : 'png';
  return new File([blob], `floor-plan.${extension}`, { type: blob.type || 'image/png' });
}

async function generateImageFromFloorPlan(
  imageDataUrl: string,
  prompt: string
): Promise<string> {
  const imageFile = await dataUrlToImageFile(imageDataUrl);
  const formData = new FormData();
  formData.append('model', 'gpt-image-1');
  formData.append('prompt', prompt);
  formData.append('size', '1536x1024');
  formData.append('quality', 'high');
  formData.append('image', imageFile);

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/images/edits',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    },
    120000
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to generate image from floor plan');
  }

  const data = await response.json();
  const generated = data.data?.[0];

  if (generated?.b64_json) {
    return `data:image/png;base64,${generated.b64_json}`;
  }

  if (generated?.url) {
    return generated.url;
  }

  throw new Error('No generated image returned');
}

interface FaithfulnessResult {
  isFaithful: boolean;
  score: number;
  reason: string;
}

async function evaluateLayoutFaithfulness(
  sourceImageDataUrl: string,
  generatedImageUrl: string,
  renderType: 'isometric' | 'room_wise'
): Promise<FaithfulnessResult> {
  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: {
          type: 'json_object',
        },
        messages: [
          {
            role: 'system',
            content:
              'You are a strict architectural geometry reviewer. Compare source floor plan and generated render only for layout faithfulness.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Compare these two images:
1) Source 2D floor plan
2) Generated ${renderType} 3D render

Return JSON with:
- is_faithful (boolean): true only if room structure, shape, boundaries, and adjacency are preserved
- score (0-100): geometric faithfulness score
- reason (string): short reason

Fail if rooms are added/removed, room shape changes significantly, or adjacency changes.`,
              },
              {
                type: 'image_url',
                image_url: { url: sourceImageDataUrl },
              },
              {
                type: 'image_url',
                image_url: { url: generatedImageUrl },
              },
            ],
          },
        ],
        max_tokens: 250,
      }),
    },
    60000
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to validate render faithfulness');
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content || '{}') as {
    is_faithful?: boolean;
    score?: number;
    reason?: string;
  };

  return {
    isFaithful: Boolean(parsed.is_faithful),
    score: parsed.score ?? 0,
    reason: parsed.reason || 'No reason provided by validator.',
  };
}

export async function analyzeFloorPlan(imageDataUrl: string): Promise<string[]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured');
  }

  try {
    const response = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
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
                  text: 'Analyze this uploaded 2D floor plan and identify only clearly visible and clearly labeled room types. Do not invent hidden rooms. Return ONLY a JSON array of unique room names, nothing else.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageDataUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 500,
        }),
      },
      60000
    );

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
    if (!Array.isArray(rooms)) {
      return [];
    }

    const normalized = rooms
      .map((room) => (typeof room === 'string' ? room.trim() : ''))
      .filter(Boolean);

    return [...new Set(normalized)];
  } catch (error) {
    console.error('Error analyzing floor plan:', error);
    throw error;
  }
}

export async function generateIsometricView(params: GenerateIsometricParams): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured');
  }

  const prompt = `Convert the uploaded 2D floor plan into a single 3D isometric dollhouse-style render for "${params.projectName}".

Hard constraints (must follow):
- Use only the exact room boundaries, wall positions, and openings visible in the uploaded plan.
- Keep room count and adjacency exactly as shown.
- Do NOT add or remove rooms, corridors, stairs, doors, windows, or structural elements.
- Do NOT hallucinate unseen areas. If unclear, leave the area simple and neutral instead of inventing details.
- Preserve overall proportions and circulation path from the source plan.
- Keep room geometry and wall lines equivalent to the source; only extrude to 3D.

Rendering style:
- Orthographic isometric angle (about 45 degrees), professional architectural visualization.
- Realistic but restrained materials and lighting.
- Keep the final image faithful to the plan first, aesthetics second.`;

  try {
    const maxAttempts = 2;
    let bestResult: { imageUrl: string; score: number; reason: string } | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptPrompt =
        attempt === 1
          ? prompt
          : `${prompt}

Retry pass: Preserve the exact room polygons, relative wall lengths, and opening positions from the source. Reduce decoration and prioritize geometric accuracy.`;

      const generatedImage = await generateImageFromFloorPlan(params.imageDataUrl, attemptPrompt);
      const validation = await evaluateLayoutFaithfulness(
        params.imageDataUrl,
        generatedImage,
        'isometric'
      );

      if (!bestResult || validation.score > bestResult.score) {
        bestResult = {
          imageUrl: generatedImage,
          score: validation.score,
          reason: validation.reason,
        };
      }

      // Accept if strong faithfulness. 70+ is often practically accurate for image models.
      if (validation.isFaithful && validation.score >= 70) {
        return generatedImage;
      }
    }

    throw new Error(
      `Layout mismatch detected (${bestResult?.score ?? 0}/100). ${bestResult?.reason || 'Generated image is not faithful to the uploaded plan.'}`
    );
  } catch (error) {
    console.error('Error generating isometric view:', error);
    throw error;
  }
}

export async function generateRoomRender(params: GenerateRoomRenderParams): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured');
  }

  const prompt = `Generate a room-wise 3D interior render for "${params.roomName}" using the uploaded 2D floor plan as source geometry.
${params.roomDescription ? `Room context: ${params.roomDescription}.` : ''}

Hard constraints (must follow):
- Focus only on the specified "${params.roomName}" from the plan.
- Keep the room shape, entry/exit position, and proportions aligned to the source plan.
- Do NOT invent extra rooms or alter the plan layout.
- Do NOT add architectural elements that are not supported by the source plan.
- If this room is ambiguous in the plan, keep the render minimal and neutral rather than guessing.

Rendering style:
- Professional architectural interior visualization.
- Eye-level perspective, realistic materials and lighting.
- Prioritize faithfulness to the uploaded plan over decorative creativity.`;

  try {
    const generatedImage = await generateImageFromFloorPlan(params.imageDataUrl, prompt);

    // Room renders are perspective interiors; strict full-plan adjacency checks cause false failures.
    const validation = await evaluateLayoutFaithfulness(
      params.imageDataUrl,
      generatedImage,
      'room_wise'
    );

    if (validation.score < 60) {
      throw new Error(
        `Room render is too different from source layout (${validation.score}/100). ${validation.reason}`
      );
    }

    return generatedImage;
  } catch (error) {
    console.error('Error generating room render:', error);
    throw error;
  }
}
