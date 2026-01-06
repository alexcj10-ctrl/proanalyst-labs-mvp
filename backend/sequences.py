from __future__ import annotations

# Catalog determinista: solo se expone lo que exista en SEQUENCE_INDEX.
# Si una combinación no existe -> el frontend no la puede seleccionar (porque /catalog se genera desde aquí).

OPTIONS = {
    "own": ["4-3-3"],
    "opp": ["4-3-3", "3-5-2", "4-2-3-1"],
    "press": ["pressing_1"],
}

# Mapa exacto (own, opp, press) -> filename mp4 en backend/videos/
SEQUENCE_INDEX = {
    ("4-3-3", "4-3-3", "pressing_1"): "433_vs_433_1.mp4",
    ("4-3-3", "3-5-2", "pressing_1"): "433_vs_352_1.mp4",
    ("4-3-3", "4-2-3-1", "pressing_1"): "433_vs_4231_1.mp4",
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
