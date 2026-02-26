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

async function loadImage(imageDataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to read uploaded floor plan image'));
    img.src = imageDataUrl;
  });
}

async function generateDeterministicIsometricFromPlan(imageDataUrl: string): Promise<string> {
  const img = await loadImage(imageDataUrl);

  const skewX = -0.58;
  const scaleY = 0.68;
  const depth = 28;
  const pad = 40;

  const projectedWidth = img.width + Math.abs(skewX) * img.height;
  const projectedHeight = img.height * scaleY;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(projectedWidth + pad * 2 + depth * 2);
  canvas.height = Math.ceil(projectedHeight + pad * 2 + depth * 2);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas context not available');
  }

  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw subtle extrusion layers so the floor plan appears as a 3D isometric slab.
  for (let offset = depth; offset >= 1; offset -= 1) {
    ctx.save();
    ctx.translate(pad + Math.abs(skewX) * img.height + offset, pad + offset);
    ctx.transform(1, 0, skewX, scaleY, 0, 0);
    ctx.globalAlpha = 0.02;
    ctx.drawImage(img, 0, 0, img.width, img.height);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(pad + Math.abs(skewX) * img.height, pad);
  ctx.transform(1, 0, skewX, scaleY, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(img, 0, 0, img.width, img.height);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

async function lockStructureOnStyledIsometric(
  baseIsometricDataUrl: string,
  styledIsometricDataUrl: string
): Promise<string> {
  const [baseImg, styledImg] = await Promise.all([
    loadImage(baseIsometricDataUrl),
    loadImage(styledIsometricDataUrl),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = baseImg.width;
  canvas.height = baseImg.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context not available');
  }

  // Keep the styled 3D render clean (no structural line overlay), while preserving output dimensions.
  ctx.drawImage(styledImg, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/png');
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
  sourceRoomCount: number;
  generatedRoomCount: number;
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
- source_room_count (number): count enclosed rooms in source plan
- generated_room_count (number): count enclosed rooms in generated render

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
    source_room_count?: number;
    generated_room_count?: number;
  };

  return {
    isFaithful: Boolean(parsed.is_faithful),
    score: parsed.score ?? 0,
    reason: parsed.reason || 'No reason provided by validator.',
    sourceRoomCount: parsed.source_room_count ?? 0,
    generatedRoomCount: parsed.generated_room_count ?? 0,
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
  try {
    const baseIsometric = await generateDeterministicIsometricFromPlan(params.imageDataUrl);

    // If key is unavailable, return deterministic geometry-preserving isometric directly.
    if (!OPENAI_API_KEY) {
      return baseIsometric;
    }

    const stylePrompt = `Convert this isometric floor-plan image into a polished architectural 3D render for "${params.projectName}".

Hard constraints (must follow exactly):
- Do not move, reshape, add, or remove any walls, rooms, door openings, window openings, corridors, or stairs.
- Keep room count and room adjacency exactly the same.
- Keep the same camera angle and composition.
- Preserve all structural geometry exactly; only enhance visual style.
- Every enclosed room and every internal partition visible in the input must remain visible in the output.
- Do not merge rooms, hide small rooms, simplify partitions, or replace areas with empty floor.
- Do not add technical line-art overlays, blueprint outlines, or dark/gray wall tracing over the final render.

Styling goals:
- Clean white wall finishes, realistic flooring materials, subtle shadows, and soft global lighting.
- Add plausible doors/windows/fixtures only where existing openings already exist.
- Professional real-estate isometric render quality similar to premium architectural brochures.`;

    const maxAttempts = 4;
    let bestStyled: { imageUrl: string; score: number } | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptPrompt =
        attempt === 1
          ? stylePrompt
          : `${stylePrompt}

Retry instruction: prioritize layout completeness over styling. Keep every room boundary and partition from the input visible and unchanged. If any area is ambiguous, preserve it exactly instead of simplifying or removing it.`;

      const styledImage = await generateImageFromFloorPlan(baseIsometric, attemptPrompt);
      const validation = await evaluateLayoutFaithfulness(baseIsometric, styledImage, 'isometric');

      if (!bestStyled || validation.score > bestStyled.score) {
        bestStyled = { imageUrl: styledImage, score: validation.score };
      }

      const roomCountMatches =
        validation.sourceRoomCount > 0 &&
        validation.generatedRoomCount > 0 &&
        validation.sourceRoomCount === validation.generatedRoomCount;

      if (validation.isFaithful && validation.score >= 90 && roomCountMatches) {
        return await lockStructureOnStyledIsometric(baseIsometric, styledImage);
      }
    }

    // If strict pass is not achieved, always return exact-structure deterministic output.
    return baseIsometric;
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
