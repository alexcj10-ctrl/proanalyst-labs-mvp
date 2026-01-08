from __future__ import annotations

# Catalog determinista: solo se expone lo que exista en SEQUENCE_INDEX.
# Un único modo de visualización: 3D.

OPTIONS = {
    "own": ["4-3-3"],
    "opp": ["4-3-3"],
    # Seguimos reutilizando "press" como selector técnico (aunque solo haya uno)
    "press": ["3d"],
}

# Mapa exacto (own, opp, press) -> filename mp4 en backend/videos/
SEQUENCE_INDEX = {
    ("4-3-3", "4-3-3", "3d"): "433vs433_1_3d.mp4",
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
