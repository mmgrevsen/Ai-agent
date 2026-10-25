#!/usr/bin/env python3
"""Builds assets/content/foods.json (Forma's reference foods) from official
food composition sources. Values are copied, never estimated.

Sources (download with .github/workflows/forma-food-sources.yml; the files
are kept on the `forma-food-sources` release):
  * Frida 5.5, DTU Food, Denmark (CC BY 4.0) - every food, Danish names.
  * USDA FoodData Central (public domain): FNDDS survey foods ("as eaten":
    dishes, sandwiches, breakfasts, drinks) and SR Legacy fast-food and
    restaurant items, minus foods already in Frida.
  * tool/foods/meals.json - whole meals calculated from the foods above.

Usage:
  pip install openpyxl
  python3 tool/foods/import_foods.py SOURCE_DIR [--out assets/content/foods.json]
SOURCE_DIR holds frida-Frida_5.5_Dataset.xlsx, usda-survey_food_csv.zip and
usda-sr_legacy_food_csv.zip.
"""
import csv
import io
import json
import re
import sys
import zipfile
from pathlib import Path

FRIDA_REF = 'Frida 5.5 (DTU Fødevareinstituttet, CC BY 4.0), fødevare-ID {}'
USDA_REF = 'USDA FoodData Central ({}), FDC ID {} (offentligt domæne)'

# Frida parameter ids. Labelling values first (what Danish packaging shows,
# EU energy factors), the standard value when a labelling value is missing.
FRIDA = {'kcal': (359, 356), 'protein': (317, 218), 'carbs': (318, 172), 'fat': (141,), 'fiber': (168,)}
# USDA nutrients: energy (kcal), protein, fat, carbohydrate by difference, fibre.
# SR Legacy files use nutrient ids; FNDDS files use the nutrient numbers.
USDA = {'kcal': '1008', 'protein': '1003', 'fat': '1004', 'carbs': '1005', 'fiber': '1079'}
USDA_NBR = {'208': '1008', '203': '1003', '204': '1004', '205': '1005', '291': '1079'}

SKIP_FRIDA = re.compile(r'^(spædbørnsmad|modermælk|vand, postevand)', re.I)
SKIP_WWEIA = re.compile(r'baby|formula|human milk|tap water|bottled water|enhanced water', re.I)
SR_GROUPS = {'Fast Foods', 'Restaurant Foods', 'Meals, Entrees, and Side Dishes'}


def r1(v):
    return None if v is None else round(float(v), 1)


def norm(name):
    words = re.sub(r'[^a-z0-9 ]', ' ', name.lower()).split()
    return ' '.join(sorted(set(words) - {'raw', 'ns', 'nfs', 'as', 'to', 'and', 'or', 'with', 'the'}))


def plausible(n):
    macros = sum(n[k] or 0 for k in ('protein', 'carbs', 'fat', 'fiber'))
    return macros <= 105 and all(n[k] is None or 0 <= n[k] <= (900 if k == 'kcal' else 100) for k in n)


def load_frida(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True)
    rows = list(wb['Data_Table'].iter_rows(values_only=True))
    ids = rows[3]
    col = {ids[i]: i for i in range(3, len(ids))}
    out = []
    for r in rows[4:]:
        if not r[2] or not r[0] or SKIP_FRIDA.match(r[0]):
            continue

        def pick(params):
            for p in params:
                v = r[col[p]]
                if v not in (None, ''):
                    return max(0.0, float(v))
            return None

        n = {k: r1(pick(p)) for k, p in FRIDA.items()}
        if n['kcal'] is None:
            continue
        out.append({'id': f'frida-{r[2]}', 'name': r[0].strip(), 'aliases': [r[1].strip()] if r[1] else [],
                    'reference': FRIDA_REF.format(r[2]), 'provenance': 'verified', 'per100g': n, '_key': ('frida', str(r[2]))})
    return out


def read_zip_csv(zf, name):
    member = next(m for m in zf.namelist() if m.endswith('/' + name) or m == name)
    return csv.DictReader(io.TextIOWrapper(zf.open(member), encoding='utf-8'))


def load_usda(path, label, keep):
    zf = zipfile.ZipFile(path)
    foods = {r['fdc_id']: r for r in read_zip_csv(zf, 'food.csv')}
    cats = {}
    if any(m.endswith('wweia_food_category.csv') for m in zf.namelist()):
        cats = {r['wweia_food_category']: r['wweia_food_category_description'] for r in read_zip_csv(zf, 'wweia_food_category.csv')}
    else:
        cats = {r['id']: r['description'] for r in read_zip_csv(zf, 'food_category.csv')}
    chosen = {i: f for i, f in foods.items() if keep(cats.get(f['food_category_id'], ''))}
    wanted = set(USDA.values())
    values = {}
    for r in read_zip_csv(zf, 'food_nutrient.csv'):
        nid = USDA_NBR.get(r['nutrient_id'], r['nutrient_id'])
        if r['fdc_id'] in chosen and nid in wanted and r['amount'] not in ('', None):
            values.setdefault(r['fdc_id'], {})[nid] = float(r['amount'])
    portions = {}
    units = {}
    if any(m.endswith('measure_unit.csv') for m in zf.namelist()):
        units = {r['id']: r['name'] for r in read_zip_csv(zf, 'measure_unit.csv')}
    for r in read_zip_csv(zf, 'food_portion.csv'):
        if r['fdc_id'] not in chosen or not r.get('gram_weight'):
            continue
        desc = (r.get('portion_description') or '').strip()
        low = desc.lower()
        if low.startswith(('quantity not specified', 'guideline amount', 'nfs')) or re.fullmatch(r'\d+', desc):
            continue
        if not desc and units:
            # SR Legacy: amount + unit + free-text modifier, e.g. "1 slice".
            amount = (r.get('amount') or '').rstrip('0').rstrip('.') if '.' in (r.get('amount') or '') else (r.get('amount') or '')
            unit = units.get(r.get('measure_unit_id', ''), '')
            unit = '' if unit in ('undetermined', 'unknown') else unit
            modifier = r.get('modifier') or ''
            desc = ' '.join(x for x in [amount, unit, '' if re.fullmatch(r'\d+', modifier) else modifier] if x).strip()
        grams = r1(float(r['gram_weight']))  # rounded first: a 0.06 g tablet is not a portion
        if desc and 0 < grams <= 2000 and len(portions.get(r['fdc_id'], [])) < 3:
            portions.setdefault(r['fdc_id'], []).append({'label': desc[:40], 'grams': r1(grams)})
    out = []
    for i, f in chosen.items():
        v = values.get(i, {})
        if USDA['kcal'] not in v:
            continue
        fiber = v.get(USDA['fiber'])
        carbs = v.get(USDA['carbs'])
        if carbs is not None and fiber is not None:
            carbs = max(0.0, carbs - fiber)  # available carbohydrate, as on EU labels
        n = {'kcal': r1(v[USDA['kcal']]), 'protein': r1(v.get(USDA['protein'])), 'carbs': r1(carbs), 'fat': r1(v.get(USDA['fat'])), 'fiber': r1(fiber)}
        out.append({'id': f'usda-{i}', 'name': f['description'].strip()[:80], 'brand': 'USDA', 'reference': USDA_REF.format(label, i),
                    'provenance': 'verified', 'per100g': n, 'servings': portions.get(i, []), '_key': ('usda', i),
                    '_cat': cats.get(f['food_category_id'], '')})
    return out


def build_meals(spec, index):
    meals = []
    for m in spec['meals']:
        total = {k: 0.0 for k in FRIDA}
        missing = set()
        grams = 0.0
        parts = []
        for ref, g, label in m['items']:
            src, ident = ref.split(':')
            food = index.get((src, ident))
            if food is None:
                raise SystemExit(f"Meal {m['id']}: unknown ingredient {ref}")
            for k in total:
                v = food['per100g'][k]
                if v is None:
                    missing.add(k)
                else:
                    total[k] += v * g / 100
            grams += g
            source = 'Frida' if src == 'frida' else 'USDA FDC'
            parts.append(f'{label} {g:g} g ({source} {ident})')
        per100 = {k: (None if k in missing else r1(total[k] * 100 / grams)) for k in total}
        meals.append({'id': f"meal-{m['id']}", 'name': m['name'], 'aliases': [m['alias']] if m.get('alias') else [],
                      'reference': 'Beregnet af Forma ud fra: ' + '; '.join(parts), 'provenance': 'calculated',
                      'per100g': per100, 'servings': [{'label': f'1 portion ({grams:g} g)', 'grams': r1(grams)}]})
    return meals


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(64)
    src = Path(args[0])
    out = Path(args[args.index('--out') + 1]) if '--out' in args else Path('assets/content/foods.json')
    frida = load_frida(src / 'frida-Frida_5.5_Dataset.xlsx')
    fndds = load_usda(src / 'usda-survey_food_csv.zip', 'FNDDS 2021-2023', lambda c: not SKIP_WWEIA.search(c))
    # All of SR Legacy is loaded so meals can use any of it; only the
    # fast-food, restaurant and ready-meal groups are published as foods.
    sr_all = load_usda(src / 'usda-sr_legacy_food_csv.zip', 'SR Legacy', lambda c: True)
    sr = [f for f in sr_all if f['_cat'] in SR_GROUPS]

    frida_names = {norm(a) for f in frida for a in f['aliases']}
    seen = set(frida_names)
    usda = []
    dropped_dupes = 0
    for f in fndds + sr:
        key = norm(f['name'])
        if key in seen:
            dropped_dupes += 1
            continue
        seen.add(key)
        usda.append(f)

    index = {f['_key']: f for f in frida + fndds + sr_all}
    meals = build_meals(json.loads((Path(__file__).parent / 'meals.json').read_text()), index)

    foods, rejected = [], 0
    for f in meals + frida + usda:
        f.pop('_key', None)
        f.pop('_cat', None)
        if not f.get('servings'):
            f.pop('servings', None)
        if not plausible(f['per100g']):
            rejected += 1
            continue
        foods.append(f)
    doc = {
        'attribution': [
            'Marija Langwagen, Jette Jacobsen, Tue Christensen and Anders Poulsen: The Danish Food Composition Database, Frida version 5.5, '
            'November 2025, National Food Institute, Technical University of Denmark. https://doi.org/10.11583/DTU.29500682 (CC BY 4.0)',
            'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central: FNDDS 2021-2023 and SR Legacy. https://fdc.nal.usda.gov (public domain)',
        ],
        'foods': foods,
    }
    out.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(meals)} meals, {len(frida)} Frida, {len(usda)} USDA (skipped {dropped_dupes} already in Frida, {rejected} implausible) '
          f'-> {len(foods)} foods, {out.stat().st_size // 1024} KB in {out}')


if __name__ == '__main__':
    main()
