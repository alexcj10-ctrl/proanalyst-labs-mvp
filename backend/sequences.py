from __future__ import annotations

# Catalog determinista: solo se expone lo que exista en SEQUENCE_INDEX.
# Todos los vídeos son 3D.

OPTIONS = {
    "own": ["4-3-3", "3-4-3", "4-4-2"],
    "opp": ["4-3-3", "4-4-2", "3-5-2"],
    "press": ["default"],
}

# Mapa exacto (own, opp, press) -> filename mp4 en backend/videos/
SEQUENCE_INDEX = {
    # 4-3-3
    ("4-3-3", "4-3-3", "default"): "433vs433_A.mp4",
    ("4-3-3", "4-4-2", "default"): "433vs442_A.mp4",
    ("4-3-3", "3-5-2", "default"): "433vs352_A.mp4",

    # 3-4-3
    ("3-4-3", "4-3-3", "default"): "343vs433_A.mp4",
    ("3-4-3", "3-4-3", "default"): "343vs343_A.mp4",
    ("3-4-3", "3-5-2", "default"): "343vs352_A.mp4",

    # 4-4-2
    ("4-4-2", "4-3-3", "default"): "442vs433_A.mp4",
    ("4-4-2", "4-4-2", "default"): "442vs442_A.mp4",
    ("4-4-2", "3-5-2", "default"): "442vs352_A.mp4",
}


def build_catalog(sequence_index: dict | None = None) -> dict:
    """
    Retrocompatible:
    - build_catalog()            -> usa SEQUENCE_INDEX
    - build_catalog(SEQUENCE_INDEX) -> usa el dict pasado
    """
    idx = sequence_index or SEQUENCE_INDEX

    combos = []
    own_set = set()
    opp_by_own: dict[str, set[str]] = {}
    press_by_pair: dict[str, set[str]] = {}

    for (own, opp, press), video in idx.items():
        combos.append({"own": own, "opp": opp, "press": press, "video": video})
        own_set.add(own)
        opp_by_own.setdefault(own, set()).add(opp)
        press_by_pair.setdefault(f"{own}|{opp}", set()).add(press)

    return {
        "own": sorted(own_set),
        "opp_by_own": {k: sorted(v) for k, v in opp_by_own.items()},
        "press_by_pair": {k: sorted(v) for k, v in press_by_pair.items()},
        "combos": combos,
    }
