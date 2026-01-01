# backend/sequences.py
from __future__ import annotations

# Opcional (legacy). Si mantienes /options en backend, esto debe existir.
OPTIONS = {
    "own": ["4-3-3", "3-5-2", "3-4-3"],
    "opp": ["4-3-3", "3-5-2", "3-4-3"],
    "press": ["pressing_1", "pressing_2"],
}

# Mapa exacto (own, opp, press) -> filename mp4 en backend/videos/
# ⚠️ Pon aquí SOLO lo que exista de verdad en /backend/videos/
SEQUENCE_INDEX = {
    # 4-3-3 vs 4-3-3
    ("4-3-3", "4-3-3", "pressing_1"): "433_vs_433_pressing_1.mp4",
    ("4-3-3", "4-3-3", "pressing_2"): "433_vs_433_pressing_2.mp4",

    # 4-3-3 vs 3-5-2
    ("4-3-3", "3-5-2", "pressing_1"): "433_vs_352_pressing_1.mp4",
    # ("4-3-3", "3-5-2", "pressing_2"): "433_vs_352_pressing_2.mp4",

    # 3-5-2 vs 4-3-3
    ("3-5-2", "4-3-3", "pressing_1"): "352_vs_433_pressing_1.mp4",

    # 3-4-3 vs 4-3-3
    ("3-4-3", "4-3-3", "pressing_1"): "343_vs_433_pressing_1.mp4",
}


def build_catalog(sequence_index: dict) -> dict:
    """
    Catálogo derivado de SEQUENCE_INDEX para alimentar selects dependientes.
    Devuelve:
      - own: [own...]
      - opp_by_own: {own: [opp...]}
      - press_by_pair: {"own|opp": [press...]}
      - combos: [{own, opp, press, video}]
    """
    combos = []
    own_set = set()
    opp_by_own = {}
    press_by_pair = {}

    for (own, opp, press), video in sequence_index.items():
        combos.append({"own": own, "opp": opp, "press": press, "video": video})
        own_set.add(own)

        opp_by_own.setdefault(own, set()).add(opp)
        pair_key = f"{own}|{opp}"
        press_by_pair.setdefault(pair_key, set()).add(press)

    return {
        "own": sorted(list(own_set)),
        "opp_by_own": {k: sorted(list(v)) for k, v in opp_by_own.items()},
        "press_by_pair": {k: sorted(list(v)) for k, v in press_by_pair.items()},
        "combos": combos,
    }
