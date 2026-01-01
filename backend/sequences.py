# backend/sequences.py

from __future__ import annotations

# Nota: MVP sin fallback. Si la combinación no existe => no_sequence (backend lo respeta).
# DEFAULT_VIDEO se mantiene por si en el futuro quieres activar fallback, pero NO se usa ahora.
DEFAULT_VIDEO = "433_vs_433_pressing_1.mp4"

OPTIONS = {
    "own": ["4-3-3", "3-5-2", "3-4-3"],
    "opp": ["4-3-3", "3-5-2", "3-4-3"],
    "press": ["pressing_1", "pressing_2"],
}

# Mapa exacto (own, opp, press) -> filename mp4 en backend/videos/
SEQUENCE_INDEX = {
    # 4-3-3 vs 4-3-3
    ("4-3-3", "4-3-3", "pressing_1"): "433_vs_433_pressing_1.mp4",
    ("4-3-3", "4-3-3", "pressing_2"): "433_vs_433_pressing_2.mp4",

    # 4-3-3 vs 3-5-2
    ("4-3-3", "3-5-2", "pressing_1"): "433_vs_352_pressing_1.mp4",

    # 3-5-2 vs 4-3-3
    ("3-5-2", "4-3-3", "pressing_1"): "352_vs_433_pressing_1.mp4",

    # 3-4-3 vs 4-3-3
    ("3-4-3", "4-3-3", "pressing_1"): "343_vs_433_pressing_1.mp4",
}

# =========================
# VALIDACIÓN (DEV)
# =========================

def _validate() -> None:
    """Asegura coherencia entre OPTIONS y SEQUENCE_INDEX (sin romper runtime)."""
    allowed_own = set(OPTIONS["own"])
    allowed_opp = set(OPTIONS["opp"])
    allowed_press = set(OPTIONS["press"])

    for (own, opp, press), filename in SEQUENCE_INDEX.items():
        if own not in allowed_own:
            raise ValueError(f"SEQUENCE_INDEX own inválido: {own}")
        if opp not in allowed_opp:
            raise ValueError(f"SEQUENCE_INDEX opp inválido: {opp}")
        if press not in allowed_press:
            raise ValueError(f"SEQUENCE_INDEX press inválido: {press}")
        if not isinstance(filename, str) or not filename.endswith(".mp4"):
            raise ValueError(f"Filename inválido para {own, opp, press}: {filename}")

_validate()
