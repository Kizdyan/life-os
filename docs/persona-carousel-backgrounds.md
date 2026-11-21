# Cinematic carousel preview

In Persona → Editorial Desk, open «Почему самая страшная сцена часто тише всех». New drafts use five locally bundled photographic backgrounds. Existing saved drafts are preserved: use «Кинофоны из библиотеки · все слайды» in the existing design step to opt in. This resets design approval through the existing revision mechanism; it does not rewrite copy or captions.

«Сгенерировать фон слайда · OpenAI» requests one text-free background through the authenticated local Media Worker. The worker reads `OPENAI_API_KEY` from its server environment (the existing launcher loads `.env.local`). The key never enters the browser bundle. This explicit action can incur provider charges. Missing credentials, unavailable Worker, timeout or provider failure uses the deterministic local library and displays a warning. No external API request is made on opening a draft or exporting it.

Provider configuration and automatic theme prompt: `config/carousel-backgrounds.json`. Bundled images and their provenance/fingerprints: `apps/web/public/carousel-backgrounds/v1/`. Generated images get a new immutable IndexedDB key and SHA-256; render verifies those bytes. Background references participate in the existing approval fingerprint. Old slides without background metadata retain their original hash and renderer.

Canvas draws the photograph, a black-to-transparent gradient with maximum opacity 0.6, then actual Cyrillic Playfair Display text (including matching italic faces). It omits flat-layout decorative lines/dots on photos. Preview and export use the same PNG. Images contain no generated lettering.

The workflow `persona-quiet-horror-review.yml` with `cinematic=true` exports the review-only prerelease `carousels-v4-cinematic-preview` from the selected branch, without requiring a merge. Existing tags/assets are never overwritten. `textApproved=false` and `designApproved=false` remain in the review ZIP. Provider success is covered with an injected test response; local library generation and browser export are real. A paid API generation was not run for acceptance.
