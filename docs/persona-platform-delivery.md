# Platform-specific delivery

Observed 26 November: Instagram accepted the PNG carousel while TikTok rejected image/png, requiring image/jpeg or image/webp. A planner status on a manual-notification job is not a platform publication receipt.

Editorial export preserves the original 1080×1350 PNGs and offers a separate TikTok JPEG ZIP from the same approved render. The JPEG conversion checks dimensions, MIME, byte signature and size; source and approval gates are unchanged. No external scheduling call is performed by this feature.

Delivery policy: separate destinations with different media requirements; a successful destination is not retried when another fails. Verify network status and platform permalink/ID where available. Manual notification is not proof of posting. Default to automatic posting when approved; music is added in the native app where available, and cannot be claimed attached until verified. YouTube community posts, VK and Threads require a supported and authorized route; do not silently substitute a video or text-only post.

Remaining work: platform-specific automated outbox, idempotent retry and readback, caption adaptation, scheduling from measured activity. Validate real JPEG export on browser/runtime and one live TikTok delivery before accepting automation.
