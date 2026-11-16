#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Quiet Luxury lighting plans from a common Python/browser JSON contract.

No image processing, no LLM request, no claims that the room was measured.

Usage:
    python tools/lighting_planner.py --scene "Актёр за пианино"
    python tools/lighting_planner.py --scene "Актёр за пианино" --json
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from typing import Any

CONTRACT = Path(__file__).resolve().parent.parent / "packages" / "core" / "src" / "persona-lighting-presets.json"
DISCLAIMER = "Рекомендация по описанию, не анализ реального видео или помещения."


def plan_lighting(scene: str) -> dict[str, Any]:
    if not isinstance(scene, str) or not scene.strip() or len(scene) > 5000:
        raise ValueError("Scene description must be 1–5000 characters")
    source = scene.strip()
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    normalized = source.lower()
    presets = contract["presets"]
    selected = next(
        (preset for preset in presets if preset["keywords"]
         and any(keyword in normalized for keyword in preset["keywords"])), presets[-1],
    )
    return {
        "version": contract["version"], "style": contract["style"], "scene": source,
        "preset": selected["id"], "title": selected["title"], "key": selected["key"],
        "fill": selected["fill"], "back": selected["back"],
        "background": selected["background"], "note": selected["note"],
        "evidence": DISCLAIMER, "source": "rules-v1",
    }


def render_text(plan: dict[str, Any]) -> str:
    return "\n".join([
        f"СХЕМА СВЕТА · {plan['style']}",
        f"Сцена: {plan['scene']}",
        f"Тип: {plan['title']}",
        "",
        f"Рисующий (Key): {plan['key']}",
        f"Заполняющий (Fill): {plan['fill']}",
        f"Контровой (Back): {plan['back']}",
        f"Фон: {plan['background']}",
        f"Проверка на площадке: {plan['note']}",
        "",
        plan["evidence"],
    ])


def main() -> None:
    parser = argparse.ArgumentParser(description="Persona pre-production lighting advice")
    parser.add_argument("--scene", required=True, help="Description of the scene")
    parser.add_argument("--json", action="store_true", help="Output structured JSON")
    parser.add_argument("--output", type=Path, help="Save UTF-8 to a new/owned output path")
    args = parser.parse_args()
    plan = plan_lighting(args.scene)
    result = json.dumps(plan, ensure_ascii=False, indent=2) if args.json else render_text(plan)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(result + "\n", encoding="utf-8")
    print(result)


if __name__ == "__main__":
    main()
