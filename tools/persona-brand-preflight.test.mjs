import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brandPreflight} from './persona-brand-preflight.mjs';
const profile=JSON.parse(readFileSync(new URL('../config/persona-brand-profile.v0.json',import.meta.url),'utf8'));
const cases=[
  [
    "valid remains review-required",
    {
      "brandId": "old-money-editorial",
      "themeFirst": false,
      "slides": [
        {
          "context": "Film Jaws, 1975",
          "authorSignature": false,
          "decorativeNumber": false,
          "palette": "dark",
          "layout": "photo-led"
        },
        {
          "authorSignature": false,
          "decorativeNumber": false,
          "palette": "light",
          "layout": "editorial-split"
        }
      ]
    },
    "REVIEW_REQUIRED"
  ],
  [
    "wrong brand",
    {
      "brandId": "other",
      "themeFirst": false,
      "slides": [
        {
          "context": "Film Jaws, 1975",
          "authorSignature": false,
          "decorativeNumber": false,
          "palette": "dark",
          "layout": "photo-led"
        },
        {
          "authorSignature": false,
          "decorativeNumber": false,
          "palette": "light",
          "layout": "editorial-split"
        }
      ]
    },
    "FAIL"
  ],
  [
    "theme-first",
    {
      "brandId": "old-money-editorial",
      "themeFirst": true,
      "slides": [
        {
          "context": "Film Jaws, 1975",
          "authorSignature": false,
          "decorativeNumber": false,
          "palette": "dark",
          "layout": "photo-led"
        },
        {
          "authorSignature": false,
          "decorativeNumber": false,
          "palette": "light",
          "layout": "editorial-split"
        }
      ]
    },
    "FAIL"
  ],
  [
    "missing context",
    {
      "brandId": "old-money-editorial",
      "themeFirst": false,
      "slides": [
        {
          "context": "",
          "authorSignature": false,
          "decorativeNumber": false,
          "palette": "dark",
          "layout": "photo-led"
        }
      ]
    },
    "FAIL"
  ],
  [
    "signature",
    {
      "brandId": "old-money-editorial",
      "themeFirst": false,
      "slides": [
        {
          "context": "Film Jaws, 1975",
          "authorSignature": true,
          "decorativeNumber": false,
          "palette": "dark",
          "layout": "photo-led"
        }
      ]
    },
    "FAIL"
  ],
  [
    "number",
    {
      "brandId": "old-money-editorial",
      "themeFirst": false,
      "slides": [
        {
          "context": "Film Jaws, 1975",
          "authorSignature": false,
          "decorativeNumber": true,
          "palette": "dark",
          "layout": "photo-led"
        }
      ]
    },
    "FAIL"
  ],
  [
    "foreign palette",
    {
      "brandId": "old-money-editorial",
      "themeFirst": false,
      "slides": [
        {
          "context": "Film Jaws, 1975",
          "authorSignature": false,
          "decorativeNumber": false,
          "palette": "neon",
          "layout": "photo-led"
        }
      ]
    },
    "FAIL"
  ],
  [
    "no slides",
    {
      "brandId": "old-money-editorial",
      "themeFirst": false,
      "slides": []
    },
    "FAIL"
  ]
];
for(const [name,draft,wanted] of cases)test(name,()=>assert.equal(brandPreflight(profile,draft).status,wanted));
