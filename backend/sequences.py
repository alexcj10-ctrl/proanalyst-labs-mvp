
from __future__ import annotations

OPTIONS = {
    "own": ["4-3-3", "3-5-2", "3-4-3"],
    "opp": ["4-3-3", "3-5-2", "3-4-3"],
    "press": ["pressing_1", "pressing_2"],
}

SEQUENCE_INDEX = {
    ("4-3-3", "4-3-3", "pressing_1"): "433_vs_433_pressing_1.mp4",
    ("4-3-3", "4-3-3", "pressing_2"): "433_vs_433_pressing_2.mp4",
    ("4-3-3", "3-5-2", "pressing_1"): "433_vs_352_pressing_1.mp4",
    ("3-5-2", "4-3-3", "pressing_1"): "352_vs_433_pressing_1.mp4",
    ("3-4-3", "4-3-3", "pressing_1"): "343_vs_433_pressing_1.mp4",
}

def build_catalog(sequence_index: dict) -> dict:
    combos = []
    own_set = set()
    opp_by_own = {}
    press_by_pair = {}

    for (own, opp, press), video in sequence_index.items():
        combos.append({"own": own, "opp": opp, "press": press, "video": video})
        own_set.add(own)
        opp_by_own.setdefault(own, set()).add(opp)
        press_by_pair.setdefault(f"{own}|{opp}", set()).add(press)

    return {
        "own": sorted(list(own_set)),
        "opp_by_own": {k: sorted(list(v)) for k, v in opp_by_own.items()},
        "press_by_pair": {k: sorted(list(v)) for k, v in press_by_pair.items()},
        "combos": combos,
    }
