#!/usr/bin/env python3
"""Fail-closed validator for declared effective Persona render intent.

The renderer must supply a complete effective inventory of transitions, effects,
colors and captions. A source EditPlan alone cannot prove filters absent.
Invoke this immediately before rendering, against FINAL resolved settings.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path


def read_json(path: Path) -> dict:
    obj = json.loads(path.read_text(encoding='utf-8-sig'))
    if not isinstance(obj, dict):
        raise ValueError(f'Expected JSON object in {path}')
    return obj


def check(plan: dict, contract: dict) -> dict:
    if contract.get('version') != 1 or not isinstance(contract.get('styleId'), str):
        raise ValueError('Unsupported contract version')
    errors = []
    if plan.get('styleId') != contract['styleId']:
        errors.append('Style ID does not match the required contract')
    intent = plan.get('renderIntent')
    if not isinstance(intent, dict):
        return {'status': 'BLOCKED', 'errors': errors + ['Missing complete effective renderIntent'],
                'styleId': contract['styleId']}
    if contract.get('requireCompleteEffectInventory') and intent.get('inventoryComplete') is not True:
        errors.append('Effect inventory not certified complete')
    effects = intent.get('effects')
    transitions = intent.get('transitions')
    captions = intent.get('captions')
    color = intent.get('color')
    if not isinstance(effects, list) or not isinstance(transitions, list) or not isinstance(captions, dict) or not isinstance(color, dict):
        return {'status': 'BLOCKED', 'errors': errors + ['Missing effects/transitions/captions/color fields'],
                'styleId': contract['styleId']}
    forbidden = set(contract['forbiddenEffects'])
    allowed = set(contract['allowedEffects'])
    for index, item in enumerate(effects):
        name = item if isinstance(item, str) else item.get('id') if isinstance(item, dict) else None
        if not isinstance(name, str):
            errors.append(f'Invalid effect entry at {index}')
        elif name in forbidden:
            errors.append(f'Forbidden effect: {name}')
        elif name not in allowed:
            errors.append(f'Unapproved effect: {name}')
    if not transitions:
        errors.append('No declared transitions (use cut for a single clip)')
    for transition in transitions:
        name = transition if isinstance(transition, str) else transition.get('type') if isinstance(transition, dict) else None
        if name not in contract['allowedTransitions']:
            errors.append(f'Unapproved transition: {name}')
    if captions.get('style') not in contract['allowedCaptionStyles']:
        errors.append('Unapproved caption style')
    for key, threshold in (
        ('marginLeftRatio', contract['minHorizontalMarginRatio']),
        ('marginRightRatio', contract['minHorizontalMarginRatio']),
        ('marginTopRatio', contract['minVerticalMarginRatio']),
        ('marginBottomRatio', contract['minVerticalMarginRatio']),
    ):
        value = captions.get(key)
        if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or value < threshold:
            errors.append(f'Caption margin too small or missing: {key}')
    width = captions.get('maxTextWidthRatio')
    if isinstance(width, bool) or not isinstance(width, (int, float)) or not math.isfinite(width) or not 0 < width <= contract['maxTextWidthRatio']:
        errors.append('Caption text width exceeds approved maximum')
    lines = captions.get('maxLines')
    if type(lines) is not int or not 1 <= lines <= contract['maxCaptionLines']:
        errors.append('Caption line count invalid')
    if color.get('preset') not in contract['allowedColorPresets']:
        errors.append('Unapproved color preset')
    mix = color.get('lutMix', 0)
    if isinstance(mix, bool) or not isinstance(mix, (int, float)) or not math.isfinite(mix) or not 0 <= mix <= contract['maxLutMix']:
        errors.append('LUT mix exceeds contract or is invalid')
    if color.get('colorSpace') != 'rec709-sdr':
        errors.append('SDR Rec.709 required; review HDR conversion separately')
    if intent.get('publicationApproved') is True and contract.get('requireAuthorReviewBeforePublishing'):
        errors.append('Render intent must not auto-approve publication')
    return {'status': 'BLOCKED' if errors else 'PASS', 'styleId': contract['styleId'],
            'errors': errors}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--plan', type=Path, required=True)
    p.add_argument('--contract', type=Path, default=Path(__file__).with_name('creative_style_contract.json'))
    a = p.parse_args()
    try:
        result = check(read_json(a.plan), read_json(a.contract))
    except (ValueError, OSError, json.JSONDecodeError, KeyError, TypeError) as exc:
        print(json.dumps({'status': 'BLOCKED', 'errors': [str(exc)]}, ensure_ascii=False))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['status'] == 'PASS' else 2


if __name__ == '__main__':
    raise SystemExit(main())