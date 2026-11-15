import unittest

from studio_ffmpeg import zoom_cut_parameters, zoom_progress


class ZoomToCutTests(unittest.TestCase):
    def test_matches_face_scale_and_anchor(self):
        outgoing = (.27, .35, .33, .24, .37, .53, .49, .53, .43, .44)
        incoming = (.20, .27, .46, .34, .32, .54, .50, .54, .42, .41)
        zoom = zoom_cut_parameters(outgoing, incoming, 154)
        scale = zoom["scale"]
        self.assertAlmostEqual(scale, 1.405, places=2)
        self.assertAlmostEqual((.43-zoom["left"])*scale, .42)
        self.assertAlmostEqual((.44-zoom["top"])*scale, .41)
        self.assertEqual((zoom["firstFrame"], zoom["lastFrame"]), (139, 153))
        self.assertEqual([zoom_progress(zoom, frame) for frame in (130, 139, 146, 153)], [0, 0, .5, 1])

    def test_rejects_short_shot_and_unmatchable_scale(self):
        face = (.3, .25, .38, .25, .35, .45, .48, .45, .45, .38)
        distant = (.3, .25, .1, .1, .35, .45, .48, .45, .45, .38)
        with self.assertRaisesRegex(ValueError, "15 frames"):
            zoom_cut_parameters(face, face, 14)
        with self.assertRaisesRegex(ValueError, "scale"):
            zoom_cut_parameters(distant, face, 154)
