# FLUX-2 Image Generator

Cloudflare Workers AI image generator using FLUX-2-dev with optional Llama prompt enhancement and multi-reference image support.

## Features

- Text-to-image generation with automatic prompt enhancement via Llama 3.2 3B
- Multi-reference image support (up to 4 PNG images)
- Real-time error handling for capacity and content moderation
- Comprehensive logging for debugging

## Setup

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/DavidJKTofan/cf-ai-image-generator)

## Usage

### Text-only generation

Enter a prompt. Llama enhances it before FLUX generates the image.

### Multi-reference generation

Upload 1-4 PNG images and provide a prompt. FLUX uses images as references.

## Error Codes

- **3040**: Capacity exceeded. Retry after brief delay.
- **3030**: Content moderation flag. Modify prompt to avoid copyrighted or public persona references.

## Logs

View real-time logs:

```bash
wrangler tail
```

## Models

- [`@cf/meta/llama-3.2-3b-instruct`](https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/) - Prompt enhancement
- [`@cf/black-forest-labs/flux-2-dev`](https://developers.cloudflare.com/workers-ai/models/flux-2-dev/) - Image generation

Llama LLM requests are routed through Cloudflare AI Gateway (`ai-gateway-image-generator`) for analytics, caching, and rate limiting.
