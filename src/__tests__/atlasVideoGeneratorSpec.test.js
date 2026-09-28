import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Atlas Cloud AI Video Generator Migration & Specification Suite (struk.md)', () => {
  const edgeFunctionPath = path.resolve('supabase/functions/creative-generate-video/index.ts');
  const creativeServicePath = path.resolve('src/services/creativeStudioService.js');
  const creativeStudioPagePath = path.resolve('src/pages/dashboard/marketing/CreativeStudioPage.jsx');
  const categoriesPath = path.resolve('src/data/categories.js');
  const prdEdgeFunctionPath = path.resolve('supabase/functions/creative-generate-prd/index.ts');

  const edgeFunctionSource = fs.readFileSync(edgeFunctionPath, 'utf8');
  const creativeServiceSource = fs.readFileSync(creativeServicePath, 'utf8');
  const creativeStudioPageSource = fs.readFileSync(creativeStudioPagePath, 'utf8');
  const categoriesSource = fs.readFileSync(categoriesPath, 'utf8');
  const prdEdgeFunctionSource = fs.readFileSync(prdEdgeFunctionPath, 'utf8');

  describe('1. Atlas Cloud Video Generator Provider & Endpoint Migration', () => {
    test('Edge function uses official Atlas Cloud endpoint: https://api.atlascloud.ai/api/v1/model/generateVideo', () => {
      assert.ok(
        edgeFunctionSource.includes('https://api.atlascloud.ai/api/v1'),
        'Must define Atlas Cloud base URL'
      );
      assert.ok(
        edgeFunctionSource.includes('/model/generateVideo'),
        'Must target /model/generateVideo endpoint'
      );
    });

    test('Edge function uses ATLAS_API_KEY from backend environment and enforces Bearer auth', () => {
      assert.ok(
        edgeFunctionSource.includes('Deno.env.get("ATLAS_API_KEY")'),
        'Must read ATLAS_API_KEY from backend environment'
      );
      assert.ok(
        edgeFunctionSource.includes('`Bearer ${ATLAS_API_KEY}`'),
        'Must send Authorization: Bearer ${ATLAS_API_KEY}'
      );
    });

    test('Edge function MVP uses bytedance/seedance-2.0-mini/text-to-video for text-to-video', () => {
      assert.ok(
        edgeFunctionSource.includes('bytedance/seedance-2.0-mini/text-to-video'),
        'Must specify model bytedance/seedance-2.0-mini/text-to-video'
      );
    });

    test('Edge function supports image-to-video using Atlas seedance model when image_url is provided', () => {
      assert.ok(
        edgeFunctionSource.includes('bytedance/seedance-2.5/image-to-video'),
        'Must support image-to-video model for image inputs'
      );
      assert.ok(
        edgeFunctionSource.includes('image_url'),
        'Must pass image_url when image-to-video is active'
      );
    });

    test('Edge function enforces defaults: duration=8, resolution=480p, ratio=9:16, generate_audio=true', () => {
      assert.ok(edgeFunctionSource.includes('480p'), 'Must enforce 480p resolution');
      assert.ok(edgeFunctionSource.includes('9:16'), 'Must enforce 9:16 aspect ratio');
      assert.ok(edgeFunctionSource.includes('generate_audio = true') || edgeFunctionSource.includes('generate_audio: true'), 'Must enable audio generation');
      assert.ok(edgeFunctionSource.includes('Math.min'), 'Must cap duration server-side');
    });

    test('Edge function queries Atlas prediction polling endpoint: /model/prediction/{id}', () => {
      assert.ok(
        edgeFunctionSource.includes('/model/prediction/'),
        'Must query /model/prediction/{id} for status polling'
      );
      assert.ok(
        edgeFunctionSource.includes('status === "completed"'),
        'Must handle completed status'
      );
      assert.ok(
        edgeFunctionSource.includes('status === "failed"'),
        'Must handle failed status'
      );
    });
  });

  describe('2. Security, Cost Control & Idempotency', () => {
    test('ATLAS_API_KEY is strictly backend-only and never referenced in frontend code', () => {
      assert.ok(
        !creativeStudioPageSource.includes('ATLAS_API_KEY'),
        'Frontend UI must NOT reference ATLAS_API_KEY'
      );
      assert.ok(
        !creativeServiceSource.includes('ATLAS_API_KEY'),
        'Frontend service must NOT reference ATLAS_API_KEY'
      );
    });

    test('Server determines Atlas model and does not allow frontend arbitrary override', () => {
      assert.ok(
        edgeFunctionSource.includes('const selectedModel = isImageToVideo ? IMAGE_TO_VIDEO_MODEL : TEXT_TO_VIDEO_MODEL'),
        'Server must lock model selection'
      );
    });

    test('Server enforces prompt validation (non-empty and max length)', () => {
      assert.ok(
        edgeFunctionSource.includes('Prompt is required for video generation'),
        'Must validate prompt presence'
      );
      assert.ok(
        edgeFunctionSource.includes('prompt.length > 1000'),
        'Must cap prompt length for cost and safety'
      );
    });
  });

  describe('3. Creative Studio Service Client Integration', () => {
    test('creativeStudioService.js exports generateVideo, getVideoGenerationStatus, and pollVideoGeneration', () => {
      assert.ok(
        creativeServiceSource.includes('export async function generateVideo'),
        'Must export generateVideo'
      );
      assert.ok(
        creativeServiceSource.includes('export async function getVideoGenerationStatus'),
        'Must export getVideoGenerationStatus'
      );
      assert.ok(
        creativeServiceSource.includes('export async function pollVideoGeneration'),
        'Must export pollVideoGeneration'
      );
    });

    test('generateVideo calls backend edge function creative-generate-video', () => {
      assert.ok(
        creativeServiceSource.includes("'creative-generate-video'"),
        'Must call edge function creative-generate-video'
      );
    });
  });

  describe('4. UI Feature Status: Coming Soon Verification', () => {
    test('CreativeStudioPage displays Generate Video with COMING SOON status badge', () => {
      assert.ok(
        creativeStudioPageSource.includes('Generate Video (AI Video Generator)'),
        'Must render Generate Video section title'
      );
      assert.ok(
        creativeStudioPageSource.includes('COMING SOON'),
        'Must display COMING SOON badge'
      );
    });

    test('Generate Video action button is disabled in public UI to prevent unintended API calls', () => {
      assert.ok(
        creativeStudioPageSource.includes('Coming Soon') &&
          creativeStudioPageSource.includes('cursor-not-allowed'),
        'Generation button must be disabled with Coming Soon label'
      );
    });

    test('categories.js lists AI Video Generator with status coming_soon', () => {
      assert.ok(
        categoriesSource.includes('AI Video Generator'),
        'categories.js must list AI Video Generator'
      );
      assert.ok(
        categoriesSource.includes("status: 'coming_soon'"),
        'AI Video Generator must have status coming_soon'
      );
    });
  });

  describe('5. FASE 6 — PRD & Gemini Isolation (CRITICAL)', () => {
    test('creative-generate-prd STRICTLY uses Gemini and PRIMARY_MODEL gemini-3.6-flash', () => {
      assert.ok(
        prdEdgeFunctionSource.includes('const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")'),
        'PRD must strictly use GEMINI_API_KEY'
      );
      assert.ok(
        prdEdgeFunctionSource.includes('const PRIMARY_MODEL = "gemini-3.6-flash"'),
        'PRD primary model must be gemini-3.6-flash'
      );
      assert.ok(
        prdEdgeFunctionSource.includes('const FALLBACK_MODEL = "gemini-3.5-flash-lite"'),
        'PRD fallback model must be gemini-3.5-flash-lite'
      );
    });

    test('PRD edge function contains ZERO references to Atlas Cloud or ATLAS_API_KEY', () => {
      assert.ok(
        !prdEdgeFunctionSource.includes('ATLAS_API_KEY'),
        'PRD must NEVER reference ATLAS_API_KEY'
      );
      assert.ok(
        !prdEdgeFunctionSource.includes('atlascloud.ai'),
        'PRD must NEVER target atlascloud.ai'
      );
      assert.ok(
        !prdEdgeFunctionSource.includes('seedance'),
        'PRD must NEVER reference seedance model'
      );
    });

    test('PRD retains video_concept and video_script generation intact via Gemini', () => {
      assert.ok(
        prdEdgeFunctionSource.includes('"video_concept":'),
        'PRD must retain video_concept field'
      );
      assert.ok(
        prdEdgeFunctionSource.includes('"video_script":'),
        'PRD must retain video_script field'
      );
    });
  });
});
