from __future__ import annotations

from typing import Any, Dict, Optional

# ============================================================
# ProAnalyst Labs — Tactical knowledge catalog v1.1
#
# The videos remain deterministic assets, but every asset now carries
# tactical metadata so the product can explain WHY a solution matters.
# ============================================================

OPTIONS = {
    "phase": ["build_up", "finishing"],
}

# (phase, own, opp, variant) -> filename
SEQUENCE_INDEX = {
    # BUILD UP
    ("build_up", "3-5-2", "3-5-2", "A"): "352vs352A.mp4",
    ("build_up", "3-5-2", "3-5-2", "B"): "352vs352B.mp4",
    ("build_up", "3-5-2", "4-3-3", "A"): "352vs433A.mp4",
    ("build_up", "3-5-2", "4-3-3", "B"): "352vs433B.mp4",
    ("build_up", "3-5-2", "4-4-2", "A"): "352vs442A.mp4",
    ("build_up", "3-5-2", "4-4-2", "B"): "352vs442B.mp4",
    ("build_up", "4-3-3", "4-2-3-1", "A"): "433vs4231.mp4",
    ("build_up", "4-3-3", "3-5-2", "A"): "433vs352A.mp4",
    ("build_up", "4-3-3", "3-5-2", "B"): "433vs352B.mp4",
    ("build_up", "4-3-3", "4-3-3", "A"): "433vs433A.mp4",
    ("build_up", "4-3-3", "4-3-3", "B"): "433vs433B.mp4",
    ("build_up", "4-3-3", "4-4-2", "A"): "433vs442A.mp4",
    ("build_up", "4-3-3", "4-4-2", "B"): "433vs442B.mp4",
    ("build_up", "4-4-2", "3-5-2", "A"): "442vs352A.mp4",
    ("build_up", "4-4-2", "3-5-2", "B"): "442vs352B.mp4",
    ("build_up", "4-4-2", "4-3-3", "A"): "442vs433A.mp4",
    ("build_up", "4-4-2", "4-3-3", "B"): "442vs433B.mp4",
    ("build_up", "4-4-2", "4-4-2", "A"): "442vs442A.mp4",
    ("build_up", "4-4-2", "4-4-2", "B"): "442vs442B.mp4",
    # FINISHING
    ("finishing", "4-3-3", "4-3-3", "FA"): "433vs433FA.mp4",
    ("finishing", "3-4-3", "4-3-3", "FA"): "343vs433FA.mp4",
    ("finishing", "4-4-2", "4-3-3", "FA"): "442vs433FA.mp4",
    ("finishing", "3-4-3", "3-5-2", "FA"): "343vs352FA.mp4",
    ("finishing", "4-3-3", "5-4-1", "FA"): "433vs541FA.mp4",
}


PHASE_LABELS = {
    "build_up": "Build Up",
    "finishing": "Finishing",
}

ROADMAP_PHASES = [
    {"id": "build_up", "label": "Build Up", "available": True},
    {"id": "progression", "label": "Progression", "available": False},
    {"id": "creation", "label": "Creation", "available": False},
    {"id": "finishing", "label": "Finishing", "available": True},
    {"id": "defensive_org", "label": "Defensive Organisation", "available": False},
    {"id": "transition", "label": "Transition", "available": False},
]

FORMATION_ORDER = [
    "3-4-2-1", "3-4-3", "3-5-2", "4-1-4-1",
    "4-2-3-1", "4-3-3", "4-4-2", "5-4-1",
]


VARIANT_METADATA: Dict[str, Dict[str, Any]] = {
    "A": {
        "label": "Solution A",
        "title": "Interior progression",
        "objective": "Create a free player by attracting the first pressure and connecting through an interior support or third-man action.",
        "principles": [
            "Numerical superiority in the first line",
            "Free-player identification",
            "Third-man connection",
            "Pressure attraction before progression",
        ],
        "key_actions": [
            "Use the goalkeeper as an active build-up player when the press commits forward.",
            "Keep supporting angles staggered instead of forming flat passing lines.",
            "Fix the nearest presser before releasing the next receiver.",
            "Accelerate after the free player receives facing forward.",
        ],
        "risk_notes": [
            "Central losses can expose the team before rest defence is organised.",
            "The receiver must scan early because pressure can arrive from the blind side.",
        ],
        "coaching_points": [
            "Create distance before asking for the ball.",
            "Receive with an open body whenever possible.",
            "Do not force the vertical pass before the opponent is fixed.",
        ],
        "profile": {"risk": "Medium", "verticality": "High", "tempo": "Controlled → Fast"},
    },
    "B": {
        "label": "Solution B",
        "title": "Outside release",
        "objective": "Manipulate the press centrally and use width to escape through the outside lane with a safer first progression.",
        "principles": [
            "Width to stretch the press",
            "Inside-to-outside circulation",
            "Support behind the ball",
            "Weak-side availability",
        ],
        "key_actions": [
            "Invite pressure toward one side before changing the exit lane.",
            "Keep the wide outlet available at a useful receiving height.",
            "Support the first wide receiver with an inside option and a return pass.",
            "Progress only when the opponent's block has been displaced.",
        ],
        "risk_notes": [
            "A slow switch can allow the opponent to trap the receiver near the touchline.",
            "Excessive width without interior support can isolate the first receiver.",
        ],
        "coaching_points": [
            "Recognise when the central lane is intentionally closed.",
            "Play away from pressure, not simply toward the touchline.",
            "Keep the next pass prepared before the wide reception.",
        ],
        "profile": {"risk": "Low–Medium", "verticality": "Medium", "tempo": "Patient → Fast"},
    },
    "FA": {
        "label": "Finishing Pattern",
        "title": "Coordinated final-third occupation",
        "objective": "Coordinate occupation of the box and supporting zones so the final action has multiple references instead of a single target.",
        "principles": [
            "Box occupation",
            "Different arrival heights",
            "Far-side presence",
            "Second-ball structure",
        ],
        "key_actions": [
            "Attack different finishing lanes rather than the same space.",
            "Keep one support player available outside the immediate finishing line.",
            "Coordinate near-side, central and far-side arrivals.",
            "Maintain balance for the second action if the first finish is blocked.",
        ],
        "risk_notes": [
            "Too many simultaneous runs can empty the support zone behind the ball.",
            "Poor rest defence can expose the team after a blocked cross or shot.",
        ],
        "coaching_points": [
            "Arrive at different times and heights.",
            "Attack space, not only the ball.",
            "Protect the next action while committing players to finish.",
        ],
        "profile": {"risk": "Medium", "verticality": "High", "tempo": "Dynamic"},
    },
}


SPECIAL_METADATA: Dict[tuple, Dict[str, Any]] = {
    ("build_up", "4-3-3", "4-2-3-1", "A"): {
        "label": "Solution A",
        "title": "Goalkeeper + third-man press escape",
        "objective": "Use the goalkeeper to create first-line superiority, attract the 4-2-3-1 press and free a technically strong midfielder for the next progression.",
        "principles": [
            "Goalkeeper as +1",
            "Numerical superiority",
            "Free player",
            "Third man",
            "Pressure attraction",
        ],
        "key_actions": [
            "Use the goalkeeper to force the first pressing line to choose a reference.",
            "Create a passing angle that prevents the two central midfielders from being screened simultaneously.",
            "Use a third-man connection when the direct central receiver is locked.",
            "Accelerate once the free midfielder receives beyond the first pressure.",
        ],
        "risk_notes": [
            "The central turnover is dangerous if the rest-defence structure is not prepared.",
            "Spacing must be large enough to stretch the press but short enough to protect the next pass.",
        ],
        "coaching_points": [
            "Do not bypass the goalkeeper if the extra player can move the press.",
            "Fix one opponent before releasing the next player.",
            "The third-man receiver should already know the forward option before receiving.",
        ],
        "profile": {"risk": "Medium", "verticality": "High", "tempo": "Controlled → Fast"},
    }
}


def _validate_index(idx: Dict[Any, Any]) -> None:
    for key, video in idx.items():
        if not isinstance(key, tuple) or len(key) != 4:
            raise ValueError(f"Invalid key in SEQUENCE_INDEX: {key!r}")

        phase, own, opp, variant = key
        if not all(isinstance(x, str) for x in (phase, own, opp, variant)):
            raise ValueError(f"Invalid key types in SEQUENCE_INDEX: {key!r}")
        if not isinstance(video, str):
            raise ValueError(f"Invalid video value for {key!r}: {video!r}")
        if "/" in video or "\\" in video or ".." in video:
            raise ValueError(f"Unsafe filename for {key!r}: {video!r}")
        if not video.lower().endswith(".mp4"):
            raise ValueError(f"Video must be .mp4 for {key!r}: {video!r}")


def get_solution_metadata(phase: str, own: str, opp: str, variant: str) -> Dict[str, Any]:
    key = (phase, own, opp, variant)
    base = SPECIAL_METADATA.get(key) or VARIANT_METADATA.get(variant) or VARIANT_METADATA["A"]

    return {
        "scenario_id": f"{phase}|{own}|{opp}|{variant}",
        "phase": phase,
        "phase_label": PHASE_LABELS.get(phase, phase.replace("_", " ").title()),
        "own": own,
        "opp": opp,
        "variant": variant,
        **base,
    }


def build_catalog(sequence_index: Optional[Dict[Any, Any]] = None) -> Dict[str, Any]:
    idx = sequence_index or SEQUENCE_INDEX
    _validate_index(idx)

    combos = []
    phases = set()
    formations = set()
    own_by_phase: Dict[str, set] = {}
    opp_by_phase_own: Dict[str, Dict[str, set]] = {}
    variants_by_phase_pair: Dict[str, set] = {}

    for (phase, own, opp, variant), video in sorted(idx.items(), key=lambda x: x[0]):
        solution = get_solution_metadata(phase, own, opp, variant)
        combos.append({**solution, "video": video, "press": variant})

        phases.add(phase)
        formations.update([own, opp])
        own_by_phase.setdefault(phase, set()).add(own)
        opp_by_phase_own.setdefault(phase, {}).setdefault(own, set()).add(opp)
        variants_by_phase_pair.setdefault(f"{phase}|{own}|{opp}", set()).add(variant)

    # Include a small set of common exploratory structures even when no video
    # exists yet, so coaches can request missing scenarios from the UI.
    ordered_formations = list(FORMATION_ORDER)
    ordered_formations += sorted(formations - set(ordered_formations))

    return {
        "version": "1.1",
        "phases": sorted(phases),
        "phase_roadmap": ROADMAP_PHASES,
        "formations": ordered_formations,
        "own_by_phase": {ph: sorted(owns) for ph, owns in own_by_phase.items()},
        "opp_by_phase_own": {
            ph: {own: sorted(opps) for own, opps in d.items()}
            for ph, d in opp_by_phase_own.items()
        },
        # New name + legacy alias for old clients.
        "variants_by_phase_pair": {k: sorted(v) for k, v in variants_by_phase_pair.items()},
        "press_by_phase_pair": {k: sorted(v) for k, v in variants_by_phase_pair.items()},
        "combos": combos,
    }
