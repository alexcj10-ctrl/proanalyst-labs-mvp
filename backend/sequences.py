from __future__ import annotations

# Catalog determinista: solo se expone lo que exista en SEQUENCE_INDEX.
# Todos los vídeos son 3D.

OPTIONS = {
    "own": ["4-3-3", "3-4-3", "4-4-2", "4-2-3-1"],
    "opp": ["4-3-3", "4-4-2", "3-5-2", "4-3-1-2", "4-3-2-1"],
    "press": ["default", "variant_b"],
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

    # 4-2-3-1
    ("4-2-3-1", "4-3-1-2", "default"): "4231vs4312_A.mp4",
    ("4-2-3-1", "4-3-1-2", "variant_b"): "4231vs4312_B.mp4",

    # (opzionale) se vuoi mantenere anche la variante vs 4-3-2-1 in futuro,
    # reinseriscila con una press diversa (es. "vs4321") per non duplicare chiavi.
    # ("4-2-3-1", "4-3-2-1", "vs4321"): "4231vs4321_B.mp4",
}


def _validate_index(idx: dict) -> None:
    # Seguridad básica: solo filenames simples mp4 (sin rutas)
    for key, video in idx.items():
        if not isinstance(key, tuple) or len(key) != 3:
            raise ValueError(f"Invalid key in SEQUENCE_INDEX: {key!r}")
        if not isinstance(video, str):
            raise ValueError(f"Invalid video value for {key!r}: {video!r}")
        if "/" in video or "\\" in video or ".." in video:
            raise ValueError(f"Unsafe video filename for {key!r}: {video!r}")
        if not video.lower().endswith(".mp4"):
            raise ValueError(f"Video must be .mp4 for {key!r}: {video!r}")


def build_catalog(sequence_index: dict | None = None) -> dict:
    """
    Retrocompatible:
    - build_catalog()               -> usa SEQUENCE_INDEX
    - build_catalog(SEQUENCE_INDEX) -> usa el dict pasado
    """
    idx = sequence_index or SEQUENCE_INDEX
    _validate_index(idx)

    combos = []
    own_set = set()
    opp_by_own: dict[str, set[str]] = {}
    press_by_pair: dict[str, set[str]] = {}

    # Orden estable
    for (own, opp, press), video in sorted(idx.items(), key=lambda x: x[0]):
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
