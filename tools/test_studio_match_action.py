import unittest
from studio_match_action import choose_incoming


class MatchActionTests(unittest.TestCase):
    def test_vision_winner_preserves_the_output_cut_and_updates_source_range(self):
        outgoing = {"first": 75, "last": 229, "record": 0}
        incoming = {"first": 30, "last": 176, "record": 154}
        selected = choose_incoming(outgoing, incoming, [8, 16, 30],
                                   {"bestId": 16, "status": "match"}, lambda frame: frame)
        self.assertEqual(selected, (16, "openrouter-vision"))
        self.assertEqual((incoming["first"], incoming["last"], incoming["record"]), (16, 162, 154))

    def test_uncertain_vision_uses_face_similarity_but_refusal_does_not(self):
        outgoing = {"first": 75, "last": 229, "record": 0}
        incoming = {"first": 30, "last": 176, "record": 154}
        selected = choose_incoming(outgoing, incoming, [8, 16, 30],
                                   {"status": "uncertain"}, {8: .7, 16: .9, 30: .4}.get)
        self.assertEqual(selected, (16, "face-ssim"))
        with self.assertRaisesRegex(ValueError, "no compatible"):
            choose_incoming(outgoing, incoming, [8, 16, 30], {"status": "no_match"}, lambda frame: .95)
