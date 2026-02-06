# backend/sequences.py
from __future__ import annotations
from typing import Optional, Dict, Any

# ============================================================
# ProAnalyst Labs — Deterministic catalog (MVP)
# Separated by PHASE to avoid any mix:
#   - build_up   (construction) -> A / B
#   - finishing  (finalization) -> FA
# ============================================================

OPTIONS = {
    "phase": ["build_up", "finishing"],
}

# (phase, own, opp, press) -> filename
SEQUENCE_INDEX = {
    # =========================
    # BUILD_UP (construction)
    # =========================
    ("build_up", "3-5-2", "3-5-2", "A"): "352vs352A.mp4",
    ("build_up", "3-5-2", "3-5-2", "B"): "352vs352B.mp4",

    ("build_up", "3-5-2", "4-3-3", "A"): "352vs433A.mp4",
    ("build_up", "3-5-2", "4-3-3", "B"): "352vs433B.mp4",

    ("build_up", "3-5-2", "4-4-2", "A"): "352vs442A.mp4",
    ("build_up", "3-5-2", "4-4-2", "B"): "352vs442B.mp4",

    # 4-3-3 build up
    ("build_up", "4-3-3", "4-2-3-1", "A"): "433vs4231.mp4",

    ("build_up", "4-3-3", "3-5-2", "A"): "433vs352A.mp4",
    ("build_up", "4-3-3", "3-5-2", "B"): "433vs352B.mp4",

    ("build_up", "4-3-3", "4-3-3", "A"): "433vs433A.mp4",
    ("build_up", "4-3-3", "4-3-3", "B"): "433vs433B.mp4",

    ("build_up", "4-3-3", "4-4-2", "A"): "433vs442A.mp4",
    ("build_up", "4-3-3", "4-4-2", "B"): "433vs442B.mp4",

    # 4-4-2 build up
    ("build_up", "4-4-2", "3-5-2", "A"): "442vs352A.mp4",
    ("build_up", "4-4-2", "3-5-2", "B"): "442vs352B.mp4",

    ("build_up", "4-4-2", "4-3-3", "A"): "442vs433A.mp4",
    ("build_up", "4-4-2", "4-3-3", "B"): "442vs433B.mp4",

    ("build_up", "4-4-2", "4-4-2", "A"): "442vs442A.mp4",
    ("build_up", "4-4-2", "4-4-2", "B"): "442vs442B.mp4",

    # =========================
    # FINISHING (finalization)
    # =========================
    ("finishing", "4-3-3", "4-3-3", "FA"): "433vs433FA.mp4",
    ("finishing", "3-4-3", "4-3-3", "FA"): "343vs433FA.mp4",
    ("finishing", "4-4-2", "4-3-3", "FA"): "442vs433FA.mp4",
}


# ============================================================
# VALIDATION
# ============================================================

def _validate_index(idx: Dict[Any, Any]) -> None:
    for key, video in idx.items():
        if not isinstance(key, tuple) or len(key) != 4:
            raise ValueError(f"Invalid key in SEQUENCE_INDEX: {key!r}")

        phase, own, opp, press = key

        if not all(isinstance(x, str) for x in (phase, own, opp, press)):
            raise ValueError(f"Invalid key types in SEQUENCE_INDEX: {key!r}")

        if not isinstance(video, str):
            raise ValueError(f"Invalid video value for {key!r}: {video!r}")

        if "/" in video or "\\" in video or ".." in video:
            raise ValueError(f"Unsafe filename for {key!r}: {video!r}")

        if not video.lower().endswith(".mp4"):
            raise ValueError(f"Video must be .mp4 for {key!r}: {video!r}")


# ============================================================
# CATALOG BUILDER
# ============================================================

def build_catalog(sequence_index: Optional[Dict[Any, Any]] = None) -> Dict[str, Any]:
    idx = sequence_index or SEQUENCE_INDEX
    _validate_index(idx)

    combos = []
    phases = set()

    own_by_phase: Dict[str, set] = {}
    opp_by_phase_own: Dict[str, Dict[str, set]] = {}
    press_by_phase_pair: Dict[str, set] = {}

    for (phase, own, opp, press), video in sorted(idx.items(), key=lambda x: x[0]):
        combos.append(
            {
                "phase": phase,
                "own": own,
                "opp": opp,
                "press": press,
                "video": video,
            }
        )

        phases.add(phase)

        own_by_phase.setdefault(phase, set()).add(own)

        opp_by_phase_own.setdefault(phase, {}).setdefault(own, set()).add(opp)

        press_by_phase_pair.setdefault(f"{phase}|{own}|{opp}", set()).add(press)

    return {
        "phases": sorted(phases),
        "own_by_phase": {ph: sorted(owns) for ph, owns in own_by_phase.items()},
        "opp_by_phase_own": {
            ph: {own: sorted(opps) for own, opps in d.items()}
            for ph, d in opp_by_phase_own.items()
        },
        "press_by_phase_pair": {k: sorted(v) for k, v in press_by_phase_pair.items()},
        "combos": combos,
    }
