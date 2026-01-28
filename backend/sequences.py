from __future__ import annotations

# Catálogo determinista: solo se expone lo que exista en SEQUENCE_INDEX.
# Vídeos 3D. Nuevo catálogo: 3-5-2 / 4-3-3 / 4-4-2 con soluciones A/B.

OPTIONS = {
    "own": ["3-5-2", "4-3-3", "4-4-2"],
    "opp": ["3-5-2", "4-3-3", "4-4-2"],
    # Soluciones tácticas múltiples
    "press": ["A", "B"],
}

# Mapa exacto (own, opp, press) -> filename mp4 en backend/videos/
SEQUENCE_INDEX = {

    # =====================
    # 3-5-2
    # =====================
    ("3-5-2", "3-5-2", "A"): "352vs352A.mp4",
    ("3-5-2", "3-5-2", "B"): "352vs352B.mp4",

    ("3-5-2", "4-3-3", "A"): "352vs433A.mp4",
    ("3-5-2", "4-3-3", "B"): "352vs433B.mp4",

    ("3-5-2", "4-4-2", "A"): "352vs442A.mp4",
    ("3-5-2", "4-4-2", "B"): "352vs442B.mp4",

    # =====================
    # 4-3-3
    # =====================
    ("4-3-3", "3-5-2", "A"): "433vs352A.mp4",
    ("4-3-3", "3-5-2", "B"): "433vs352B.mp4",

    ("4-3-3", "4-3-3", "A"): "433vs433A.mp4",
    ("4-3-3", "4-3-3", "B"): "433vs433B.mp4",

    ("4-3-3", "4-4-2", "A"): "433vs442A.mp4",
    ("4-3-3", "4-4-2", "B"): "433vs442B.mp4",

    # =====================
    # 4-4-2
    # =====================
    ("4-4-2", "3-5-2", "A"): "442vs352A.mp4",
    ("4-4-2", "3-5-2", "B"): "442vs352B.mp4",

    ("4-4-2", "4-3-3", "A"): "442vs433A.mp4",
    ("4-4-2", "4-3-3", "B"): "442vs433B.mp4",

    ("4-4-2", "4-4-2", "A"): "442vs442A.mp4",
    ("4-4-2", "4-4-2", "B"): "442vs442B.mp4",
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
        combos.append({
            "own": own,
            "opp": opp,
            "press": press,
            "video": video
        })
        own_set.add(own)
        opp_by_own.setdefault(own, set()).add(opp)
        press_by_pair.setdefault(f"{own}|{opp}", set()).add(press)

    return {
        "own": sorted(own_set),
        "opp_by_own": {k: sorted(v) for k, v in opp_by_own.items()},
        "press_by_pair": {k: sorted(v) for k, v in press_by_pair.items()},
        "combos": combos,
    }
