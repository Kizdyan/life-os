# Single-photo editorial lane

This lane runs in Node.js (crypto and zlib), behind the server adapter boundary.

`buildPhotoEditorialPackage` in the core accepts one selected `own_raw` MediaAsset,
a pixel crop, protected subject/detail rectangles, a restrained processing recipe,
an editorial angle and explicitly linked caption, and output dimensions.

The source adapter only reads; there are no move, upload or overwrite operations.
The lane snapshots inputs and gives the renderer separate byte copies. It checks
canonical MD5 or SHA-256 against the source, records SHA-256, and rereads the
source after rendering to detect changes. Unsupported provider hash formats fail.

A crop must retain at least 80% of source area and every supplied protected region.
Export preserves crop aspect ratio and cannot upscale. Exposure is limited to
±0.5 EV; contrast and saturation are normalized adjustments limited to ±0.1.
No additional processing keys are accepted. The renderer must implement only
those operations, orient source dimensions consistently, and return noninterlaced
8-bit RGB/RGBA PNG. A production pixel renderer is intentionally an injected
adapter, as with other provider-independent core boundaries.

The returned derivative, caption.txt, and photo-editorial.json form the package.
The manifest retains provenance, source/export hashes, the exact crop and recipe,
editorial linkage and passing check names. There are no timestamps or generated
IDs: identical input and renderer bytes produce identical packages. Export QA
checks PNG signature, chunk CRCs, dimensions, encoding, zlib payload length,
scanline filters and file termination. Any failed check throws before a package
is returned. Successful packages stop at EDITORIAL_READY; nothing is published.

Composition checks protect supplied geometry, not aesthetic judgment. The caller
must identify meaningful subject/detail regions. Pixel fidelity and correct
application of the recipe remain the renderer adapter's responsibility. This
slice does not add a UI, storage writes, automatic photo ranking, or AI retouching.
