export interface Env {
	AI: any;
}

async function streamToBlob(stream: ReadableStream, contentType: string): Promise<Blob> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}

	return new Blob(chunks, { type: contentType });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		if (url.pathname === '/generate' && request.method === 'POST') {
			try {
				console.log('[GENERATE] Request received');

				const formData = await request.formData();
				const prompt = formData.get('prompt') as string;
				const enhance = formData.get('enhance') === 'true';
				const images: File[] = [];

				for (let i = 0; i < 4; i++) {
					const img = formData.get(`image_${i}`) as File | null;
					if (img) images.push(img);
				}

				console.log('[INPUT] Prompt length:', prompt?.length || 0);
				console.log('[INPUT] Enhance enabled:', enhance);
				console.log('[INPUT] Images provided:', images.length);

				if (!prompt || prompt.trim().length === 0) {
					console.error('[ERROR] No prompt provided');
					return new Response(JSON.stringify({ error: 'Prompt required' }), {
						status: 400,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' },
					});
				}

				let finalPrompt = prompt.trim();
				let enhancedPrompt: string | undefined;

				// Only enhance prompt if enabled and no images provided
				if (enhance && images.length === 0) {
					console.log('[LLAMA] Starting prompt enhancement via AI Gateway');
					console.log('[LLAMA] Original prompt:', finalPrompt);

					try {
						const enhanceResponse = await env.AI.run(
							'@cf/meta/llama-3.2-3b-instruct',
							{
								messages: [
									{
										role: 'system',
										content:
											'You are a prompt enhancement specialist for image generation. STRICT RULES: 1) Never add objects, people, animals, or elements not mentioned in the original prompt. Only enhance what is already there. 2) Never use brand names, celebrity names, character names, or any proper nouns. 3) Focus on enhancing: lighting quality, color palette, atmosphere, composition, camera angles, artistic style, texture details, and visual mood. 4) Use only generic terms like "person", "building", "landscape", "object". 5) Keep the core subject matter exactly as specified. Output ONLY the enhanced prompt with no preamble or explanation.',
									},
									{
										role: 'user',
										content: `Enhance this for image generation: ${finalPrompt}`,
									},
								],
							},
							{
								gateway: {
									id: 'ai-gateway-image-generator',
								},
							}
						);

						console.log('[LLAMA] Raw response:', JSON.stringify(enhanceResponse, null, 2));

						const enhanced = enhanceResponse.response?.trim();
						if (enhanced && enhanced.length > 0 && enhanced !== finalPrompt) {
							enhancedPrompt = enhanced;
							finalPrompt = enhanced;
							console.log('[LLAMA] Enhanced prompt:', finalPrompt);
						} else {
							console.log('[LLAMA] No enhancement applied, using original');
						}
					} catch (llamaErr: any) {
						console.error('[LLAMA] Enhancement failed:', llamaErr.message);
						console.error('[LLAMA] Error details:', JSON.stringify(llamaErr, null, 2));
						console.log('[LLAMA] Continuing with original prompt');
					}
				} else {
					if (images.length > 0) {
						console.log('[SKIP] Prompt enhancement skipped (images provided)');
					} else {
						console.log('[SKIP] Prompt enhancement disabled by user');
					}
				}

				// Sanitize prompt to avoid false positive content moderation
				console.log('[SANITIZE] Pre-sanitization prompt:', finalPrompt);

				// Remove any potential trigger words (even if benign)
				const sanitized = finalPrompt
					.replace(/\b(over|on|at|in|near)\s+(the\s+)?mountains?\b/gi, 'with mountain landscape')
					.replace(/\bsunset\b/gi, 'golden hour lighting')
					.replace(/\bsunrise\b/gi, 'dawn lighting')
					.trim();

				if (sanitized !== finalPrompt) {
					console.log('[SANITIZE] Sanitized prompt:', sanitized);
					finalPrompt = sanitized;
				}

				// Prepare multipart form for FLUX - ALWAYS use multipart format
				console.log('[FLUX] Preparing multipart form data');
				const fluxForm = new FormData();
				fluxForm.append('prompt', finalPrompt);
				fluxForm.append('width', '1024');
				fluxForm.append('height', '1024');
				fluxForm.append('steps', '25');

				// Add images if provided
				for (let i = 0; i < images.length; i++) {
					console.log(`[FLUX] Processing image ${i}: ${images[i].name}, ${images[i].size} bytes, ${images[i].type}`);
					const imgBlob = await streamToBlob(images[i].stream(), images[i].type || 'image/png');
					fluxForm.append(`input_image_${i}`, imgBlob);
					console.log(`[FLUX] Added input_image_${i} to form`);
				}

				// Log FormData contents
				const formDataLog: Record<string, any> = {};
				for (const [key, value] of fluxForm.entries()) {
					if (value instanceof Blob) {
						formDataLog[key] = `Blob(${value.size} bytes, ${value.type})`;
					} else {
						formDataLog[key] = value;
					}
				}
				console.log('[FLUX] FormData contents:', JSON.stringify(formDataLog, null, 2));

				// Create temporary request to serialize FormData properly
				const formRequest = new Request('http://dummy', {
					method: 'POST',
					body: fluxForm,
				});
				const formStream = formRequest.body;
				const formContentType = formRequest.headers.get('content-type') || 'multipart/form-data';

				console.log('[FLUX] Content-Type header:', formContentType);
				console.log('[FLUX] Stream type:', formStream?.constructor?.name);
				console.log('[FLUX] Calling FLUX-2-dev model');

				try {
					const fluxInput = {
						multipart: {
							body: formStream,
							contentType: formContentType,
						},
					};

					console.log(
						'[FLUX] INPUT structure:',
						JSON.stringify(
							{
								multipart: {
									body: `[${formStream?.constructor?.name}]`,
									contentType: formContentType,
								},
							},
							null,
							2
						)
					);

					const fluxResponse = await env.AI.run('@cf/black-forest-labs/flux-2-dev', fluxInput);

					console.log('[FLUX] Generation successful');
					console.log('[FLUX] OUTPUT - Response type:', typeof fluxResponse);
					console.log('[FLUX] OUTPUT - Response constructor:', fluxResponse?.constructor?.name);

					// Log response structure
					if (fluxResponse && typeof fluxResponse === 'object') {
						console.log('[FLUX] OUTPUT - Response keys:', Object.keys(fluxResponse));
						if (fluxResponse.image) {
							console.log('[FLUX] OUTPUT - Image type:', typeof fluxResponse.image);
							console.log('[FLUX] OUTPUT - Image length:', fluxResponse.image.length);
							console.log('[FLUX] OUTPUT - Image preview (first 100 chars):', fluxResponse.image.substring(0, 100));
						}
					}

					// FLUX returns { image: "base64string" }
					if (fluxResponse && typeof fluxResponse === 'object' && fluxResponse.image) {
						console.log('[FLUX] OUTPUT - Valid response with base64 image');
						return new Response(
							JSON.stringify({
								success: true,
								image: fluxResponse.image,
								enhancedPrompt: enhancedPrompt,
								timestamp: new Date().toISOString(),
							}),
							{
								headers: { ...corsHeaders, 'Content-Type': 'application/json' },
							}
						);
					}

					console.error('[FLUX] OUTPUT - Unexpected response format');
					console.error('[FLUX] OUTPUT - Full response:', JSON.stringify(fluxResponse, null, 2));
					throw new Error('Invalid response from FLUX model');
				} catch (fluxErr: any) {
					console.error('[FLUX] Generation failed:', fluxErr.message);
					console.error('[FLUX] Error stack:', fluxErr.stack);
					console.error('[FLUX] Error details:', JSON.stringify(fluxErr, null, 2));

					let errorMessage = fluxErr.message || 'Image generation failed';
					let errorCode = 'UNKNOWN_ERROR';

					if (errorMessage.includes('3040')) {
						errorMessage = 'Capacity temporarily exceeded. Please try again in a moment.';
						errorCode = 'CAPACITY_EXCEEDED';
					} else if (errorMessage.includes('3030')) {
						errorMessage = 'Prompt flagged for potential copyright or public persona concerns. Please modify your prompt.';
						errorCode = 'CONTENT_MODERATION';
					} else if (errorMessage.includes('rate limit')) {
						errorMessage = 'Rate limit exceeded. Please try again later.';
						errorCode = 'RATE_LIMIT';
					}

					return new Response(
						JSON.stringify({
							success: false,
							error: errorMessage,
							code: errorCode,
							timestamp: new Date().toISOString(),
						}),
						{
							status: 500,
							headers: { ...corsHeaders, 'Content-Type': 'application/json' },
						}
					);
				}
			} catch (err: any) {
				console.error('[ERROR] Request processing failed:', err.message);
				console.error('[ERROR] Stack:', err.stack);

				return new Response(
					JSON.stringify({
						success: false,
						error: err.message || 'Internal server error',
						code: 'SERVER_ERROR',
						timestamp: new Date().toISOString(),
					}),
					{
						status: 500,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' },
					}
				);
			}
		}
		return new Response('Not Found', { status: 404 });
	},
};
