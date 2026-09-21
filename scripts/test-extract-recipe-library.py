"""Regression checks for quantity errors found in the supplied recipe PDFs."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("recipe_import", Path(__file__).with_name("extract-recipe-library.py"))
recipe_import = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recipe_import)


class SourceQuantityTests(unittest.TestCase):
    def test_percentage_is_a_product_description(self):
        item = recipe_import.ingredient("Dark Chocolate", "70% 50g or 1.7 oz")
        self.assertEqual((item["quantity"], item["unit"]), (50, "g"))
        self.assertIn("70%", item["name"])
        self.assertEqual(item["sourceText"], "Dark Chocolate 70% 50g or 1.7 oz")

    def test_percentage_without_an_amount_is_not_a_quantity(self):
        self.assertIsNone(recipe_import.ingredient("Dark Chocolate", "70%")["quantity"])

    def test_spaced_mixed_fraction(self):
        item = recipe_import.ingredient("Vinegar", "1 ½ tsp")
        self.assertEqual((item["quantity"], item["unit"]), (1.5, "tsp"))

    def test_complete_source_units(self):
        for measure, expected in [("175 grams", "grams"), ("3.5 fl oz", "fl oz"),
                                  ("1 heaped tbsp", "heaped tbsp"), ("2 level tsp", "level tsp"),
                                  ("1 pinch", "pinch"), ("10cm, chopped", "cm"),
                                  ("5 inch piece", "inch"), ("1, clove", "clove")]:
            with self.subTest(measure=measure):
                self.assertEqual(recipe_import.ingredient("Ingredient", measure)["unit"], expected)

    def test_compound_preparations_remain_complete(self):
        for name, measure in [("Tortilla", "4, 2 large & 2 small"), ("Stock Cubes", "1 beef, 1 veg"),
                              ("Eggs", "3 (2 whole, 1 egg white)"),
                              ("Sauce", "4 tbsp Soy Sauce, 1 tbsp Honey, 1 tbsp Brown Sugar")]:
            with self.subTest(name=name):
                item = recipe_import.ingredient(name, measure)
                self.assertIsNone(item["quantity"])
                self.assertEqual(item["sourceText"], name + " " + measure)

    def test_ranges_are_not_replaced_by_the_lower_amount(self):
        self.assertIsNone(recipe_import.ingredient("Black Pepper", "2-3 twists")["quantity"])

    def test_bold_quantity_still_scales(self):
        item = recipe_import.ingredient("Honey 1 tbsp", "")
        self.assertEqual((item["quantity"], item["unit"], item["name"]), (1, "tbsp", "Honey"))

    def test_decimal_comma_and_malformed_nutrients_are_distinct(self):
        page = Page([text_block("KCAL", (500, 50, 530, 60)), text_block("434,6", (500, 65, 530, 75)),
                     text_block("FAT", (500, 220, 530, 230)), text_block("35.g", (500, 235, 530, 245))])
        numeric, printed = recipe_import.nutrition_values(page)
        self.assertEqual(numeric["calories"], 434.6)
        self.assertNotIn("fat", numeric)
        self.assertEqual(printed, {"calories": "434,6", "fat": "35.g"})

    def test_overlapping_text_layers_are_one_instruction(self):
        step = text_block("Stir the ingredients together.", (40, 180, 500, 220))
        page = Page([text_block("Method", (30, 120, 110, 150)), step, step,
                     text_block("Allergen Information", (420, 730, 560, 745))])
        self.assertEqual(recipe_import.method_steps(page), ["Stir the ingredients together."])


def text_block(text, box):
    return {"type": 0, "bbox": box, "lines": [{"spans": [{"text": text, "bbox": box, "size": 10, "font": "Poppins-Regular"}]}]}


class Page:
    def __init__(self, blocks):
        self.blocks = blocks

    def get_text(self, kind, **kwargs):
        return {"blocks": self.blocks}


if __name__ == "__main__":
    unittest.main()
