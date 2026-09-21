"""Import supplied Canva recipe PDFs using their native layout and photographs.

The PDFs remain private. This script emits structured recipe data and the supplied
food photographs only. Recipe yields, ingredients and nutrition are never invented.
Run with --checkpoint <source checkpoint> --pdf-dir <directory> (repeat as needed).
"""
from pathlib import Path
from collections import defaultdict, Counter
import argparse
import hashlib
import io
import json
import re
import unicodedata

import fitz
from PIL import Image


def clean(value):
    return re.sub(r"(?<=\w)- (?=\w)", "-", re.sub(r"\s+", " ", value).strip())


def slug(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", value.lower().replace("&", " and ")).strip("-")


def compact(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", value.lower())


def spans(page):
    return [s for b in text_blocks(page)
            for line in b["lines"] for s in line["spans"]]


def block_text(block):
    return clean(" ".join(s["text"] for line in block["lines"] for s in line["spans"]))


def text_blocks(page):
    # A few PDFs contain identical text objects painted twice at the same position.
    # Reading those as two instructions would duplicate an action that appears once.
    blocks = page.get_text("dict", flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)["blocks"]
    seen = set()
    result = []
    for block in blocks:
        if block["type"] != 0:
            continue
        key = (tuple(round(value, 2) for value in block["bbox"]), block_text(block))
        if key not in seen:
            seen.add(key)
            result.append(block)
    return result


FRACTIONS = {"¼": .25, "½": .5, "¾": .75, "⅓": 1/3, "⅔": 2/3,
             "⅛": .125, "⅜": .375, "⅝": .625, "⅞": .875}
NUM = r"(?:\d+\s+\d+/\d+|\d+/\d+|\d+\s+[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?[¼½¾⅓⅔⅛⅜⅝⅞]?|[¼½¾⅓⅔⅛⅜⅝⅞])"


def number(value):
    value = value.strip()
    if value[-1:] in FRACTIONS:
        return float(value[:-1] or 0) + FRACTIONS[value[-1]]
    if "/" in value:
        bits = value.split()
        numerator, denominator = bits[-1].split("/")
        return (float(bits[0]) if len(bits) > 1 else 0) + float(numerator)/float(denominator)
    return float(value)


def ingredient(name, measure):
    """Scale only an unambiguous leading printed amount; preserve every source row."""
    if not measure:
        printed = re.fullmatch(r"(.+?)\s+(" + NUM + r")\s*(kg|g|ml|l|tbsp|tsp|cups?|oz)?\s*", name, re.I)
        if printed:
            name, measure = printed[1], printed[2] + (" " + printed[3] if printed[3] else "")
    raw = clean(name + " " + measure)
    result = {"name": clean(name), "quantity": None, "unit": "", "note": "",
              "group": "Main", "optional": "optional" in raw.lower(), "aisle": "Other",
              "sourceText": raw, "sourceQuantity": None, "sourceUnit": "",
              "sourceMeasure": measure, "alternateMeasure": "", "scalingMode": "unquantified"}
    if not measure:
        return result
    percentage = re.match(r"^(\d+(?:\.\d+)?%\s*(?:(?:cocoa|dark|fat|lean)\s*)?)\s*(?=" + NUM + r"\s*(?:g|kg|ml|oz)\b)", measure, re.I)
    if percentage:
        result["name"] += " (" + percentage[1].strip() + ")"
        measure = measure[percentage.end():].strip()
    match = re.match(r"^(" + NUM + r")\s*", measure)
    if not match:
        if len(raw) <= 200:
            result["name"] = raw
        else:
            result["note"] = measure
        return result
    quantity = number(match[1])
    remaining = measure[match.end():].strip()
    if re.match(r"^,\s*(?:cloves?|pinch|cubes?|fillets?|squares?|biscuits?|leaves?|sticks?|bags?|shots?)\b", remaining, re.I):
        remaining = remaining.lstrip(", ")
    if remaining.startswith("%"):
        result["name"] = raw
        return result
    if re.match(r"^(?:-|–|—|to\b|x\b|×|/)", remaining):
        result.update(name=raw, scalingMode="range" if remaining.startswith(("-", "–", "to")) else "compound")
        return result
    unit_match = re.match(r"^((?:heaped|level)\s+(?:tsp|tbsp|teaspoons?|tablespoons?)|fl\s*oz|fluid\s+ounces?|kilograms?|grams?|millilitres?|kg|g|ml|l|litres?|tbsp|tsp|cups?|oz|teaspoons?|tablespoons?|handfuls?|pinch(?:es)?|twists?|cloves?|slices?|leaves|leaf|spears?|stalks?|sprigs?|sheets?|scoops?|medium|small|large|single|whole|pieces?|cans?|tins?|pouches?|packs?|cm|inch(?:es)?|cubes?|fillets?|squares?|biscuits?|sticks?|bags?|shots?)\b\s*", remaining, re.I)
    unit = unit_match[1] if unit_match else ""
    remainder = remaining[unit_match.end():].strip() if unit_match else remaining
    # Compound preparations contain several quantities. Keep the complete row.
    if re.search(r"(?:(?:\band|&)\s*" + NUM + r"|,\s*" + NUM + r"\s*(?:tbsp|tsp|g|ml|cup|beef|veg(?:etable)?|whole|egg\s*white|large|small)\b|\+)", remainder, re.I):
        result.update(name=raw if len(raw) <= 200 else name, note=measure if len(raw) > 200 else "", scalingMode="compound")
        return result
    result.update(quantity=quantity, unit=unit, sourceQuantity=quantity, sourceUnit=unit, scalingMode="exact")
    if remainder:
        if re.match(r"^(?:or\s|\()", remainder):
            result["alternateMeasure"] = remainder
            result["note"] = "Original reference: " + remainder + ". Scaling uses the leading printed amount."
        else:
            result["note"] = remainder.lstrip(", ")
    return result


def ingredient_rows(page):
    rows = []
    for block in text_blocks(page):
        if block["type"] != 0 or block["bbox"][1] < 620:
            continue
        columns = defaultdict(list)
        for line in block["lines"]:
            for span in line["spans"]:
                if span["size"] > 12.1:
                    continue
                columns[int(span["bbox"][0] >= 300)].append(span)
        for column, ss in columns.items():
            ss.sort(key=lambda s: (round(s["bbox"][1], 1), s["bbox"][0]))
            groups = []
            current = []
            has_measure = False
            for span in ss:
                is_bold = "Bold" in span["font"]
                if is_bold and span["text"].strip() and has_measure:
                    groups.append(current)
                    current = []
                    has_measure = False
                current.append(span)
                if not is_bold and span["text"].strip():
                    has_measure = True
            if current:
                groups.append(current)
            for group in groups:
                name = clean(" ".join(s["text"] for s in group if "Bold" in s["font"]))
                measure = clean(" ".join(s["text"] for s in group if "Bold" not in s["font"]))
                if name.lower() in {"ingredients", "ingredient", "your logo here", "your name here"}:
                    continue
                if not name:
                    name, measure = measure, ""
                if name:
                    rows.append((column, group[0]["bbox"][1], ingredient(name, measure)))
    rows.sort(key=lambda row: (row[0], row[1]))
    return [row[2] for row in rows]


def method_steps(page):
    blocks = text_blocks(page)
    heading = next((b for b in blocks if b["type"] == 0 and block_text(b).lower() == "method"), None)
    if heading is None:
        raise ValueError("Recipe method heading missing")
    top = heading["bbox"][3]
    bottom = min([b["bbox"][1] for b in blocks if b["type"] == 0 and
                  "Allergen Information" in block_text(b)] or [730])
    steps = []
    for block in sorted(blocks, key=lambda b: (b["bbox"][1], b["bbox"][0])):
        if block["type"] != 0 or block["bbox"][1] <= top or block["bbox"][1] >= bottom - 2:
            continue
        text = block_text(block)
        if not text or re.fullmatch(r"\d+", text):
            continue
        steps.append(re.sub(r"^\d+[.)]\s*", "", text))
    return steps


def nutrition_values(page):
    ss = spans(page)
    nutrition = {}
    printed = {}
    for code, key in [("KCAL", "calories"), ("PRO", "protein"), ("CARB", "carbs"), ("FAT", "fat"), ("FIBER", "fibre")]:
        target = next((s for s in ss if s["text"].strip() in ({"FIBER", "FIBRE"} if code == "FIBER" else {code})), None)
        if target is None:
            continue
        tx = (target["bbox"][0]+target["bbox"][2])/2
        candidates = [s for s in ss if abs((s["bbox"][0]+s["bbox"][2])/2-tx) < 45
                      and 1 < abs(s["bbox"][1]-target["bbox"][1]) < 28
                      and re.fullmatch(r"\d+[\d.,]*g?", s["text"].strip())]
        if len(candidates) == 1:
            value = candidates[0]["text"].strip()
            printed[key] = value
            if re.fullmatch(r"\d+(?:[.,]\d+)?g?", value):
                nutrition[key] = float(value.rstrip("g").replace(",", "."))
    return nutrition, printed


def parse_nutrition(page):
    return nutrition_values(page)[0]


def serving(page, name):
    ss = spans(page)
    makes = clean(" ".join(s["text"] for s in ss if re.search(r"\b(?:Makes|Serves)\s+\d", s["text"], re.I)))
    per = clean(" ".join(s["text"] for s in ss if re.search(r"\bPer\s", s["text"], re.I) and s["bbox"][0] > 420 and s["bbox"][1] < 400))
    match = re.search(r"(?:Makes|Serves)\s+(" + NUM + r")\s*(.*)", makes, re.I)
    if not match:
        raise ValueError("Printed recipe yield missing: " + makes)
    count = number(match[1])
    yield_label = match[2].strip()
    label = re.sub(r"^per\s*", "", per, flags=re.I).strip().lower() or "serving"
    warnings = []
    amount = re.match(r"(" + NUM + r")\s+(.+)", label)
    hint = re.search(r"1\s+serv(?:e|ing)\s+is\s+(" + NUM + r")", makes, re.I)
    if amount:
        divisor = number(amount[1])
        if any(token in name.lower() or token in yield_label.lower() for token in [amount[2].rstrip("s")]):
            count /= divisor
        else:
            warnings.append("Source nutrition label conflicts with the dish: “" + per + "”. Nutrition is retained for review and excluded from meal-plan totals.")
    elif hint:
        divisor = number(hint[1])
        count /= divisor
        label = clean(hint[1] + " " + re.sub(r"\s*\(.*", "", yield_label)).lower()
    elif label in {"serving", "portion"}:
        # A count-only yield is the source's stated number of portions.
        pass
    elif label in {"ball", "slice", "muffin", "bar", "cookie", "pancake", "piece", "square", "popsicle", "pop", "pot", "wrap", "fritter", "cake", "burger", "scone", "cup"}:
        pass
    else:
        warnings.append("Source nutrition basis needs review: “" + (per or "not supplied") + "”. Nutrition is excluded from meal-plan totals.")
    return {"servings": count, "servingLabel": label[:40], "servingBasis": makes + (" / " + per if per else ""),
            "sourceYield": makes, "sourceNutritionBasis": per, "yieldQuantity": number(match[1]), "yieldLabel": yield_label}, warnings


def photo(doc, page, target):
    candidates = [image for image in page.get_images() if image[2] >= 400 and image[3] >= 300]
    if not candidates:
        raise ValueError("No original food photograph")
    best = max(candidates, key=lambda im: im[2]*im[3])
    data = doc.extract_image(best[0])["image"]
    if target.exists() and target.stat().st_size > 0:
        image = Image.open(target)
    else:
        image = Image.open(io.BytesIO(data)).convert("RGB")
        image.thumbnail((1200, 1000))
        output = io.BytesIO()
        image.save(output, "WEBP", quality=85, method=5)
        target.write_bytes(output.getvalue())
    return {"imageXref": best[0], "originalImageSha256": hashlib.sha256(data).hexdigest(),
            "imageSha256": hashlib.sha256(target.read_bytes()).hexdigest(), "imageSize": list(image.size)}


def recipe_category(book, name):
    if "Breakfast" in book["title"]:
        return "Breakfast"
    if "Smoothie" in book["title"]:
        return "Drinks"
    if "Snack" in book["title"] or "Sides" in book["title"]:
        return "Snacks"
    if "Salad" in book["title"]:
        return "Lunch"
    if re.search(r"smoothie|shake", name, re.I):
        return "Drinks"
    if re.search(r"breakfast|porridge|overnight oats|bircher|pancakes|baked oats", name, re.I):
        return "Breakfast"
    return "Dinner"


def category_index(inventory):
    choices = defaultdict(set)
    for book in inventory:
        for ordinal, name in enumerate(book["recipeNames"], 1):
            cleaned_name = re.split(r"\s+KCAL\b", name)[0]
            category = recipe_category(book, name)
            if book["id"] == "DAGzG7jNyAk":
                if ordinal <= 24:
                    category = "Breakfast"
                elif ordinal >= 48:
                    category = "Drinks" if re.search(r"smoothie|booster", name, re.I) else "Snacks"
                elif "salad" in name.lower():
                    category = "Lunch"
            choices[compact(cleaned_name)].add(category)
    priority = ["Breakfast", "Drinks", "Snacks", "Lunch", "Dinner"]
    return {name: next(category for category in priority if category in options) for name, options in choices.items()}


def source_title(page):
    ss = spans(page)
    title = [s for s in ss if s["size"] > 20 and s["bbox"][1] < 455]
    title.sort(key=lambda s: (s["bbox"][1], s["bbox"][0]))
    return clean(" ".join(s["text"] for s in title))


def identify(doc, inventory):
    pages = [i for i, page in enumerate(doc) if re.search(r"\bPrep\s*:", page.get_text())]
    names = {compact(source_title(doc[i])) for i in pages}
    scored = [(sum(compact(n) in names for n in book["recipeNames"]), book) for book in inventory]
    scored.sort(key=lambda result: result[0], reverse=True)
    score, book = scored[0]
    if score < max(2, len(pages) * .6):
        raise ValueError("Cannot identify book confidently: " + str([(x[0], x[1]["id"]) for x in scored[:3]]))
    if len(pages) != book["extractedRecipeEntries"]:
        raise ValueError(f"Recipe page count differs for {book['id']}: {len(pages)} vs {book['extractedRecipeEntries']}")
    return book, pages


def duplicate_fingerprint(recipe):
    # Recipe names alone are insufficient: preserve distinct dishes with similar titles.
    content = {"name": compact(recipe["name"]),
               "ingredients": sorted(compact(item["sourceText"]) for item in recipe["ingredients"]),
               "steps": [compact(step) for step in recipe["steps"]],
               "yield": compact(recipe["sourceYield"]),
               "nutrition": recipe.get("sourceNutrition", recipe["nutrition"]),
               "basis": compact(recipe["sourceNutritionBasis"])}
    return hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--pdf-dir", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--allow-partial", action="store_true", help="Prepare an internal review draft while remaining PDFs arrive")
    args = parser.parse_args()
    root = args.output.resolve()
    inventory = json.loads((args.checkpoint / "book-inventory.json").read_text())
    categories = category_index(inventory)
    existing = json.loads((root / "data/cookbooks/high-protein-kitchen.json").read_text())["recipes"]
    assets = root / "public/assets/recipe-library"
    assets.mkdir(parents=True, exist_ok=True)
    overrides_path = Path(__file__).with_name("recipe-library-overrides.json")
    overrides = json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
    paths = sorted({path.resolve() for directory in args.pdf_dir for path in directory.glob("*.pdf")})
    book_records = []
    recipes = []
    audit = []
    identified = set()
    failures = []
    for path in paths:
        try:
            doc = fitz.open(path)
            book, pages = identify(doc, inventory)
        except Exception as error:
            failures.append({"file": path.name, "error": str(error)})
            continue
        if book["id"] in identified:
            continue
        identified.add(book["id"])
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        book_records.append({"id": book["id"], "title": book["title"], "recipeCount": len(pages), "sourceEntryCount": len(pages),
                             "pages": len(doc), "sha256": digest})
        print("Extracting", book["id"], len(pages), path.name, flush=True)
        for ordinal, page_number in enumerate(pages, 1):
            page = doc[page_number]
            name = source_title(page)
            key = book["id"] + ":" + str(ordinal)
            ss = spans(page)
            items = ingredient_rows(page)
            method = method_steps(doc[page_number + 1])
            portion, warnings = serving(page, name)
            source_nutrition, nutrition_printed = nutrition_values(page)
            planner_nutrition = {key: source_nutrition[key] for key in ("calories", "protein", "carbs", "fat")} if all(key in source_nutrition for key in ("calories", "protein", "carbs", "fat")) else None
            override = overrides.get(key, {})
            warnings += override.get("sourceWarnings", [])
            if "ingredients" in override:
                items = [ingredient(item[0], item[1]) for item in override["ingredients"]]
            if "serving" in override:
                portion.update(override["serving"])
            if portion["servingLabel"].startswith("1 "):
                portion["sourceServingLabel"] = portion["servingLabel"]
                portion["servingLabel"] = portion["servingLabel"][2:]
            elif re.match(r"^\d", portion["servingLabel"]) or portion["servingLabel"] == "one third of batch":
                portion["sourceServingLabel"] = portion["servingLabel"]
                portion["servingLabel"] = "portion"
                portion["servingBasis"] += "; one portion = " + portion["sourceServingLabel"]
            for item in items:
                if item["quantity"] is None:
                    continue
                # Some sides give pasta per portion even though the other rows are
                # whole-recipe quantities. Convert only that explicit source basis.
                amount = NUM + r"\s*" + re.escape(item["sourceUnit"])
                alternate = r"(?:\s*or\s*" + NUM + r"\s*(?:oz|g|ml|fl\s*oz|cups?))?"
                per_portion = re.fullmatch(amount + alternate + r"\s+per\s+(?:portion|serving|serve)\b[^\d]*", item.get("sourceMeasure", ""), re.I)
                if per_portion:
                    item["quantity"] *= portion["servings"]
                    item["scalingMode"] = "explicit-per-portion-to-batch"
                    item["note"] += f" The source gives this amount per portion; the amount shown covers all {portion['servings']:g} recipe portions."
            review = bool(override.get("nutritionReviewRequired")) or any("Nutrition is" in warning for warning in warnings)
            description = clean(" ".join(s["text"] for s in ss if 445 < s["bbox"][1] < 545 and s["size"] > 10))
            times = {}
            text = page.get_text()
            for source_label, field in [("Prep", "prepMinutes"), ("Cook", "cookMinutes")]:
                match = re.search(source_label + r"\s*:\s*(\d+(?:\.\d+)?)\s*min", text, re.I)
                times[field] = float(match[1]) if match else None
            recipe_id = slug(name)[:67]
            target = assets / (book["id"] + "-" + str(ordinal).zfill(2) + ".webp")
            image_audit = photo(doc, page, target)
            source = {"id": book["id"], "title": book["title"], "page": page_number + 1, "recipeNumber": ordinal}
            allergen_blocks = [b for b in text_blocks(doc[page_number+1]) if b["type"] == 0
                               and b["bbox"][1] > 742 and b["bbox"][0] > 390]
            allergen_text = clean(" ".join(block_text(b) for b in allergen_blocks))
            if "none" in allergen_text.lower():
                allergen_text = ""
            recipe = {"id": recipe_id, "name": name, "category": categories.get(compact(name), recipe_category(book, name)), **portion,
                      "nutrition": None if review else planner_nutrition, "sourceNutrition": source_nutrition, "sourceNutritionPrinted": nutrition_printed,
                      "nutritionSource": f"{book['title']}, page {page_number+1}. Figures reproduced from the supplied book. Values are source estimates; ingredient brands and alternatives can change them.",
                      "nutritionStatus": "review-needed" if review or planner_nutrition is None else "source-estimate",
                      "source": f"{book['title']} · p. {page_number+1}", "sourceBook": book["id"],
                      "sourceBookId": book["id"], "sourceBookTitle": book["title"], "sourceBooks": [source],
                      "sourceRecipeNumber": ordinal, "sourcePage": page_number+1, "sourceImagePage": page_number+1,
                      "sourceSha256": digest, "image": "/assets/recipe-library/" + target.name,
                      "imageNote": f"Original photograph from {book['title']}, page {page_number+1}.",
                      "quote": "", "description": description, "ingredients": items, "steps": method,
                      **times, "waitMinutes": None, "timeNote": "Preparation and cooking times are reproduced from the source. Follow any additional resting or chilling instructions in the method.",
                      "notes": "\n".join(warnings), "allergens": [],
                      "allergenNote": (("Source allergen information: " + allergen_text + " ") if allergen_text else "") + "Check ingredient labels, sauces and alternatives for your own requirements.",
                      "sourceWarnings": warnings, "version": 2}
            assert 2 <= len(items) <= 100, (key, name, "ingredient count", len(items))
            assert method and len(method) <= 50, (key, name, "method count", len(method))
            assert all(len(step) <= 2000 for step in method), (key, "method too long")
            assert all(len(item["name"]) <= 200 for item in items), (key, "ingredient name too long")
            recipes.append(recipe)
            audit.append({"key": key, "name": name, "page": page_number+1, "ingredients": len(items), "steps": len(method),
                          "sourceYield": portion["sourceYield"], "nutritionBasis": portion["sourceNutritionBasis"],
                          "nutritionStatus": recipe["nutritionStatus"], "sourceRows": [item["sourceText"] for item in items], **image_audit})
    missing = [book["id"] for book in inventory if book["id"] not in identified]
    if missing and not args.allow_partial:
        raise ValueError("Missing source PDFs: " + ", ".join(missing))
    order = {book["id"]: i for i, book in enumerate(inventory)}
    recipes.sort(key=lambda recipe: (order[recipe["sourceBookId"]], recipe["sourceRecipeNumber"]))
    unique = []
    fingerprints = {}
    occupied = {recipe["id"] for recipe in existing}
    duplicates = []
    for recipe in recipes:
        fingerprint = duplicate_fingerprint(recipe)
        if fingerprint in fingerprints:
            canonical = fingerprints[fingerprint]
            canonical["sourceBooks"].extend(recipe["sourceBooks"])
            canonical["sourceWarnings"] = list(dict.fromkeys(canonical["sourceWarnings"] + recipe["sourceWarnings"]))
            canonical["notes"] = "\n".join(canonical["sourceWarnings"])
            if recipe["nutritionStatus"] == "review-needed":
                canonical["nutritionStatus"] = "review-needed"
                canonical["nutrition"] = None
            duplicates.append({"canonicalId": canonical["id"], "duplicateSource": recipe["sourceBooks"][0], "fingerprint": fingerprint})
            continue
        if recipe["id"] in occupied:
            recipe["id"] = recipe["id"][:64] + "-" + recipe["sourceBookId"][-8:].lower()
        assert recipe["id"] not in occupied, recipe["id"]
        occupied.add(recipe["id"])
        fingerprints[fingerprint] = recipe
        unique.append(recipe)
    book_records.sort(key=lambda book: order[book["id"]])
    for book in book_records:
        book["recipeCount"] = sum(any(source["id"] == book["id"] for source in recipe["sourceBooks"]) for recipe in unique)
    used = {recipe["image"].split("/")[-1] for recipe in unique}
    for path in assets.glob("*.webp"):
        if path.name not in used:
            path.unlink()
    result = {"source": {"title": "Nutrition.Fitness recipe library", "bookCount": len(book_records), "sourceRecipeCount": len(recipes),
                         "recipeCount": len(unique), "duplicateEntriesConsolidated": len(duplicates),
                         "status": "source-validated" if not missing else "partial-review-draft",
                         "missingSourceBooks": missing}, "books": book_records, "recipes": unique}
    filename = "recipe-library.partial.json" if missing else "recipe-library.json"
    write_json(root / "data/cookbooks" / filename, result)
    write_json(root / "data/cookbooks/recipe-library-audit.json", {"summary": result["source"], "entries": audit, "duplicates": duplicates, "unidentifiedFiles": failures})
    if not missing:
        (root / "data/cookbooks/recipe-library.partial.json").unlink(missing_ok=True)
    print(json.dumps(result["source"], indent=2))


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temporary.replace(path)


if __name__ == "__main__":
    main()
