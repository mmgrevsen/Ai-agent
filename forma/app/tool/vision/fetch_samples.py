#!/usr/bin/env python3
"""Downloads real photos for the on-device Vision check in CI (they are not
committed). Food photos are the lead images of Wikipedia articles; nutrition
labels come from Open Food Facts with the values entered for the same
product, so OCR results can be compared with what is printed on the label.

Usage: python3 tool/vision/fetch_samples.py OUT_DIR
Writes OUT_DIR/food-<slug>.jpg, OUT_DIR/off-<barcode>.jpg and
OUT_DIR/expected.json ({"foods": {file: expected words}, "labels": {file: per-100 g values}}).
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = 'Forma-CI/1.0 (https://github.com/mmgrevsen/Ai-agent; photo recognition test)'

# Wikipedia article -> words one of the top suggestions should contain.
FOODS = {
    'Pizza': ['pizza'],
    'Banana': ['banan'],
    'Hamburger': ['burger'],
    'Fried_egg': ['æg', 'egg'],
    'Bacon': ['bacon'],
    'Spaghetti': ['spaghetti', 'pasta'],
    'Sushi': ['sushi'],
    'Caesar_salad': ['salat', 'salad'],
    'Pancake': ['pandekage', 'pancake'],
    'French_fries': ['pommes', 'fries', 'kartof'],
    'Croissant': ['croissant'],
    'Lasagne': ['lasagne'],
    'Broccoli': ['broccoli'],
    'Strawberry': ['jordbær', 'strawberr'],
    'Apple': ['æble', 'apple'],
    'Porridge': ['grød', 'porridge', 'oat'],
    'Smørrebrød': ['rugbrød', 'smørrebrød', 'sandwich'],
    'Rye_bread': ['rugbrød', 'rye'],
    'Hot_dog': ['hotdog', 'hot dog', 'pølse'],
    'Omelette': ['omelet', 'æg', 'egg'],
    'Waffle': ['vaffel', 'waffle'],
    'Doughnut': ['doughnut', 'donut'],
    'Cheesecake': ['cheesecake', 'kage'],
    'Steak': ['bøf', 'steak', 'okse'],
    'Salmon_as_food': ['laks', 'salmon'],
    'Burrito': ['burrito'],
    'Taco': ['taco'],
    'Ice_cream': ['is', 'ice cream'],
    'Muffin': ['muffin'],
    'Avocado': ['avocado'],
}


def get(url, accept='application/json'):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def save_jpeg(data, path):
    path.write_bytes(data)


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    expected = {'foods': {}, 'labels': {}}

    for title, words in FOODS.items():
        try:
            info = json.loads(get('https://en.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(title)))
            src = (info.get('thumbnail') or {}).get('source')
            if not src:
                print(f'{title}: no image')
                continue
            # Ask for a 1024 px wide rendition, close to what the app sends.
            src = re.sub(r'/\d+px-', '/1024px-', src.split('?')[0])
            name = f"food-{title.lower().replace('_', '-')}.jpg"
            if not src.lower().endswith(('.jpg', '.jpeg')):
                print(f'{title}: skipped non-JPEG {src}')
                continue
            save_jpeg(get(src, 'image/*'), out / name)
            expected['foods'][name] = words
            print(f'{title}: {src}')
        except Exception as e:  # network hiccups only cost a sample
            print(f'{title}: failed {e}')
        time.sleep(0.3)

    products = []
    searches = [
        'https://world.openfoodfacts.org/api/v2/search?' + urllib.parse.urlencode({
            'countries_tags_en': 'denmark',
            'fields': 'code,product_name,image_nutrition_url,nutriments',
            'sort_by': 'unique_scans_n',
            'page_size': 100,
        }),
        'https://world.openfoodfacts.org/cgi/search.pl?' + urllib.parse.urlencode({
            'action': 'process', 'json': 1, 'page_size': 100, 'sort_by': 'unique_scans_n',
            'tagtype_0': 'countries', 'tag_contains_0': 'contains', 'tag_0': 'denmark',
            'fields': 'code,product_name,image_nutrition_url,nutriments',
        }),
    ]
    for attempt in range(6):
        url = searches[attempt % len(searches)]
        try:
            products = json.loads(get(url)).get('products', [])
            if products:
                break
        except Exception as e:
            print(f'Open Food Facts search failed ({e}), retrying')
        time.sleep(5 * (attempt + 1))
    taken = 0
    for p in products:
        n = p.get('nutriments') or {}
        url = p.get('image_nutrition_url')
        values = {
            'kcal': n.get('energy-kcal_100g'),
            'protein': n.get('proteins_100g'),
            'carbs': n.get('carbohydrates_100g'),
            'fat': n.get('fat_100g'),
        }
        if not url or any(not isinstance(v, (int, float)) for v in values.values()):
            continue
        full = url.replace('.400.jpg', '.full.jpg')
        name = f"off-{p['code']}.jpg"
        try:
            save_jpeg(get(full, 'image/*'), out / name)
        except Exception as e:
            print(f"{p['code']}: failed {e}")
            continue
        expected['labels'][name] = {**values, 'product': p.get('product_name', '')}
        taken += 1
        print(f"{p['code']}: {p.get('product_name', '')}")
        if taken >= 30:
            break
        time.sleep(0.3)

    (out / 'expected.json').write_text(json.dumps(expected, ensure_ascii=False, indent=1))
    print(f"{len(expected['foods'])} food photos, {len(expected['labels'])} label photos")


if __name__ == '__main__':
    main()
