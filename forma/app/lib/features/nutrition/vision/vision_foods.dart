import '../../../content/content_bundle.dart';
import 'vision_result.dart';

/// Apple Vision's food labels and what to search the reference foods for,
/// best first. Danish words find Frida foods and Forma's meals; English
/// ones find USDA dishes. A label missing here is ignored, so a photo of a
/// kitchen never suggests "kitchen".
const visionFoodQueries = <String, List<String>>{
  // Fruit and berries
  'apple': ['æble'],
  'apricot': ['abrikos'],
  'avocado': ['avocado'],
  'banana': ['banan'],
  'berry': ['bærmix', 'jordbær', 'blåbær'],
  'blackberry': ['brombær', 'blackberries'],
  'blueberry': ['blåbær'],
  'cantaloupe': ['cantaloupe', 'melon'],
  'cherry': ['kirsebær'],
  'citrus_fruit': ['appelsin', 'mandarin', 'citron'],
  'coconut': ['kokosnød', 'kokos'],
  'cranberry': ['tranebær'],
  'fig': ['figen'],
  'grape': ['vindrue'],
  'grapefruit': ['grapefrugt'],
  'guava': ['guava'],
  'honeydew': ['honningmelon', 'melon'],
  'kiwi': ['kiwi'],
  'lemon': ['citron'],
  'lime': ['lime'],
  'lychee': ['litchi'],
  'mandarine': ['mandarin'],
  'mango': ['mango'],
  'melon': ['melon'],
  'nectarine': ['nektarin'],
  'oranges': ['appelsin'],
  'papaya': ['papaya'],
  'passionfruit': ['passionsfrugt'],
  'peach': ['fersken'],
  'pear': ['pære'],
  'persimmon': ['kaki', 'persimmon'],
  'pineapple': ['ananas'],
  'plum': ['blomme'],
  'pomegranate': ['granatæble'],
  'raspberry': ['hindbær'],
  'rhubarb': ['rabarber'],
  'starfruit': ['stjernefrugt', 'carambola'],
  'strawberry': ['jordbær'],
  'watermelon': ['vandmelon'],
  // Vegetables
  'artichoke': ['artiskok'],
  'arugula': ['rucola'],
  'asparagus': ['asparges'],
  'bean': ['bønner'],
  'beet': ['rødbede'],
  'bell_pepper': ['peberfrugt'],
  'broccoli': ['broccoli'],
  'carrot': ['gulerod'],
  'cauliflower': ['blomkål'],
  'celery': ['selleri'],
  'chives': ['purløg'],
  'cilantro': ['koriander'],
  'corn': ['majs'],
  'cucumber': ['agurk'],
  'daikon': ['ræddike', 'radise'],
  'dill': ['dild'],
  'edamame': ['edamame'],
  'eggplant': ['aubergine'],
  'garlic': ['hvidløg'],
  'green_beans': ['grønne bønner'],
  'habanero': ['chili'],
  'jalapeno': ['jalapeño', 'chili'],
  'kohlrabi': ['kålrabi'],
  'leek': ['porre'],
  'lettuce': ['salat'],
  'mushroom': ['champignon', 'svampe'],
  'onion': ['løg'],
  'pea': ['ærter'],
  'pepper_veggie': ['peberfrugt'],
  'pickle': ['agurk syltet'],
  'potato': ['kartoffel'],
  'pumpkin': ['græskar'],
  'radish': ['radise'],
  'sauerkraut': ['surkål', 'sauerkraut'],
  'seaweed': ['tang'],
  'spinach': ['spinat'],
  'taro': ['taro'],
  'tomato': ['tomat'],
  'zucchini': ['squash'],
  // Nuts and seeds
  'almond': ['mandel'],
  'cashew': ['cashew'],
  'chestnut': ['kastanje'],
  'macadamia': ['macadamia'],
  'nut': ['nødder', 'jordnød', 'mandel'],
  'peanut': ['jordnød', 'peanuts'],
  'pecan': ['pekan'],
  'pistachio': ['pistacie'],
  'sesame': ['sesamfrø'],
  'sunflower_seeds': ['solsikkekerne', 'sunflower seeds'],
  // Bread, grains, breakfast
  'bagel': ['bagel'],
  'bread': ['rugbrød', 'franskbrød', 'hvedebrød'],
  'cereal': ['müsli', 'cornflakes', 'havregryn'],
  'croissant': ['croissant'],
  'matzo': ['matzo'],
  'naan': ['naan'],
  'oatmeal': ['havregrød', 'havregryn', 'oatmeal'],
  'pasta': ['pasta kogt', 'pasta'],
  'pita': ['pita'],
  'pretzel': ['pretzel'],
  'quinoa': ['quinoa'],
  'rice': ['ris kogte', 'ris'],
  'spaghetti': ['spaghetti', 'pasta kogt'],
  'tortilla': ['tortilla'],
  'white_bread': ['franskbrød', 'toastbrød'],
  // Dairy and eggs
  'butter': ['smør'],
  'cheese': ['ost'],
  'egg': ['hårdkogte', 'egg whole boiled', 'æg høne frilands', 'egg whole fried'],
  'fried_egg': ['spejlæg', 'egg whole fried'],
  'milkshake': ['milkshake'],
  'omelet': ['omelet', 'egg omelet'],
  'scrambled_eggs': ['røræg', 'egg scrambled'],
  'yogurt': ['yoghurt', 'skyr'],
  'yolk': ['æg høne blomme', 'egg yolk'],
  // Meat and fish
  'anchovy': ['ansjos'],
  'bacon': ['pork bacon', 'bacon'],
  'beef': ['oksekød', 'bøf'],
  'clam': ['musling'],
  'crab': ['krabbe'],
  'fish': ['torsk filet', 'rødspætte', 'fiskefilet', 'laks'],
  'fried_chicken': ['chicken fried', 'kylling'],
  'grilled_chicken': ['kyllingebryst', 'chicken grilled', 'kylling'],
  'ham': ['skinke'],
  'hamburger': ['burger', 'hamburger'],
  'hotdog': ['hotdog', 'hot dog', 'pølse'],
  'kebab': ['kebab'],
  'lobster': ['hummer'],
  'mackerel': ['makrel'],
  'meat': ['kød'],
  'meatball': ['frikadelle', 'kødboller', 'meatball'],
  'mussel': ['musling'],
  'oyster': ['østers'],
  'pepperoni': ['pepperoni'],
  'poultry': ['kylling'],
  'roe': ['rogn'],
  'salami': ['salami'],
  'salmon': ['laks'],
  'sardine': ['sardin'],
  'sausage': ['pølse'],
  'scallop': ['kammusling', 'scallops'],
  'seabass': ['havbars', 'bass'],
  'seafood': ['rejer', 'seafood'],
  'shawarma': ['shawarma'],
  'shellfish': ['rejer', 'musling'],
  'shellfish_prepared': ['rejer'],
  'snapper': ['snapper'],
  'souvlaki': ['souvlaki', 'shawarma'],
  'spareribs': ['spareribs', 'ribs'],
  'steak': ['bøf', 'oksekød', 'steak'],
  'sushi': ['sushi'],
  'swordfish': ['sværdfisk', 'swordfish'],
  'trout': ['ørred'],
  'tuna': ['tun'],
  // Dishes
  'antipasti': ['antipasti', 'salami', 'oliven'],
  'biryani': ['biryani'],
  'bruschetta': ['bruschetta'],
  'burrito': ['burrito'],
  'caprese': ['caprese', 'mozzarella'],
  'casserole': ['gryderet', 'casserole'],
  'coleslaw': ['coleslaw'],
  'curry': ['karry', 'curry'],
  'dumpling': ['dumpling'],
  'falafel': ['falafel'],
  'fondue': ['fondue'],
  'fries': ['pommes frites'],
  'guacamole': ['guacamole'],
  'gyoza': ['gyoza', 'dumpling'],
  'hummus': ['hummus'],
  'nachos': ['nachos'],
  'paella': ['paella'],
  'pierogi': ['pierogi'],
  'pizza': ['pizza'],
  'quesadilla': ['quesadilla'],
  'ramen': ['ramen', 'noodles'],
  'risotto': ['risotto', 'ris kogte'],
  'salad': ['salat', 'salad'],
  'samosa': ['samosa'],
  'sandwich': ['sandwich', 'smørrebrød'],
  'satay': ['satay', 'peanut sauce'],
  'soup': ['suppe', 'soup'],
  'springroll': ['forårsrulle'],
  'stir_fry': ['wok', 'stir fry'],
  'tabbouleh': ['tabbouleh'],
  'taco': ['taco'],
  'tapas': ['tapas', 'chorizo', 'oliven'],
  'tempura': ['tempura'],
  'teriyaki': ['teriyaki'],
  'wonton': ['wonton'],
  // Cakes, sweets and snacks
  'baklava': ['baklava'],
  'birthday_cake': ['lagkage', 'kage', 'cake'],
  'biscotti': ['biscotti'],
  'biscuit': ['kiks'],
  'brownie': ['brownie'],
  'cake': ['kage', 'cake'],
  'cake_regular': ['kage', 'cake'],
  'candy': ['slik', 'vingummi', 'lakrids'],
  'candy_cane': ['candy cane', 'lakrids', 'vingummi'],
  'candy_other': ['slik', 'vingummi', 'lakrids'],
  'caramel': ['karamel'],
  'cheesecake': ['cheesecake'],
  'chewing_gum': ['tyggegummi'],
  'chocolate': ['chokolade'],
  'chocolate_chip': ['chocolate chip', 'chokolade'],
  'cookie': ['småkage', 'cookie'],
  'crepe': ['pandekage', 'crepe'],
  'cupcake': ['cupcake', 'muffin'],
  'donut': ['doughnut'],
  'easter_egg': ['påskeæg', 'chokolade'],
  'flan': ['flan'],
  'frozen_dessert': ['is'],
  'fruitcake': ['frugtkage', 'cake fruit'],
  'gingerbread': ['brunkage', 'honningkage', 'gingerbread'],
  'honey': ['honning'],
  'ice_cream': ['is', 'ice cream'],
  'jello': ['gele', 'gelatin'],
  'jelly': ['marmelade'],
  'lollipop': ['slikkepind', 'lollipop'],
  'marshmallow': ['skumfidus', 'marshmallow'],
  'muffin': ['muffin'],
  'pancake': ['pandekage'],
  'pastry': ['wienerbrød'],
  'pie': ['tærte', 'pie'],
  'popcorn': ['popcorn'],
  'popsicle': ['sodavandsis', 'pindeis'],
  'pudding': ['budding', 'pudding'],
  'scone': ['scone'],
  'souffle': ['souffle'],
  'strudel': ['strudel'],
  'sugar_cube': ['sukker'],
  'taffy': ['taffy'],
  'tiramisu': ['tiramisu'],
  'waffle': ['vaffel', 'waffle'],
  'wedding_cake': ['lagkage', 'kage', 'cake'],
  // Drinks
  'beer': ['øl', 'beer'],
  'bubble_tea': ['bubble tea'],
  'cocktail': ['cocktail'],
  'coffee': ['kaffe'],
  'juice': ['juice'],
  'liquor': ['spiritus', 'vodka'],
  'margarita': ['margarita'],
  'martini': ['martini'],
  'mojito': ['mojito'],
  'red_wine': ['rødvin'],
  'sangria': ['sangria'],
  'smoothie': ['smoothie'],
  'soda': ['sodavand'],
  'sparkling_wine': ['mousserende vin', 'champagne'],
  'tea_drink': ['te drikkeklar', 'te'],
  'tequila': ['tequila'],
  'white_wine': ['hvidvin'],
  'wine': ['rødvin', 'hvidvin'],
  // Condiments
  'condiment': ['ketchup', 'sennep', 'mayonnaise'],
  'mustard': ['sennep'],
  'wasabi': ['wasabi'],
};

/// Display names where the first search isn't a good name on its own.
const _titles = {
  'egg': 'Æg',
  'fried_egg': 'Spejlæg',
  'yolk': 'Æggeblomme',
  'rice': 'Ris',
  'pasta': 'Pasta',
  'pickle': 'Syltede agurker',
  'green_beans': 'Grønne bønner',
  'fries': 'Pommes frites',
  'tea_drink': 'Te',
  'fried_chicken': 'Stegt kylling',
  'grilled_chicken': 'Grillet kylling',
  'cantaloupe': 'Melon',
  'fish': 'Fisk',
  'bacon': 'Bacon',
  'meatball': 'Frikadeller',
  'candy_cane': 'Slikstok',
  'chocolate_chip': 'Chokolade',
  'sparkling_wine': 'Mousserende vin',
  'sunflower_seeds': 'Solsikkekerner',
  'stir_fry': 'Wok',
  'bubble_tea': 'Bubble tea',
};

/// Labels that mean "there is food" without saying which.
const visionGenericFood = {
  'food', 'fruit', 'vegetable', 'dessert', 'drink', 'baked_goods', 'grain', 'herb', 'spice', 'seasonings', 'liquid',
};

/// Labels that mean the photo shows printed text, e.g. a nutrition label.
const visionDocument = {'document', 'printed_page', 'receipt', 'screenshot', 'handwriting'};

/// Foods suggested for one thing Vision recognised.
class FoodSuggestionGroup {
  const FoodSuggestionGroup({required this.label, required this.title, required this.foods});
  final VisionLabel label;

  /// The search word shown to the user, e.g. "Pizza" or "Æble".
  final String title;
  final List<ContentFood> foods;
}

class _Indexed {
  _Indexed(this.food)
      : name = _words(food.name),
        aliases = [for (final a in food.aliases) _words(a)],
        source = food.id.startsWith('frida-')
            ? 0
            : food.id.startsWith('meal-')
                ? 1
                : 2;
  final ContentFood food;
  final List<String> name;
  final List<List<String>> aliases;
  final int source;
}

final _split = RegExp(r'[^0-9a-zæøåéèüöäßñ]+');
List<String> _words(String s) => [for (final w in s.toLowerCase().split(_split)) if (w.isNotEmpty) w];

/// Searches reference foods by whole words, so "is" (ice cream) finds
/// "Is, vanilje" and not every food containing the letters "is".
class VisionFoodMatcher {
  VisionFoodMatcher(List<ContentFood> foods) : _index = [for (final f in foods) _Indexed(f)];
  final List<_Indexed> _index;

  /// Lower is better; null when a query word is missing.
  static int? _score(_Indexed e, List<String> query) {
    var worst = 0;
    for (final q in query) {
      int? s;
      if (e.name.isNotEmpty && e.name.first == q) {
        s = 0;
      } else if (e.name.contains(q)) {
        s = 1;
      } else if (e.name.any((w) => w.startsWith(q))) {
        s = 2;
      } else if (e.aliases.any((a) => a.contains(q))) {
        s = 3;
      } else if (e.aliases.any((a) => a.any((w) => w.startsWith(q)))) {
        s = 4;
      }
      if (s == null) return null;
      if (s > worst) worst = s;
    }
    return worst;
  }

  /// Best matches first: whole-word matches, then Danish foods, Forma's
  /// meals and USDA, then the shortest (most basic) name.
  List<ContentFood> search(String query, {int limit = 4}) {
    final q = _words(query);
    if (q.isEmpty) return const [];
    final hits = <(int, _Indexed)>[];
    for (final e in _index) {
      final s = _score(e, q);
      if (s != null) hits.add((s, e));
    }
    hits.sort((a, b) {
      final s = a.$1.compareTo(b.$1);
      if (s != 0) return s;
      final src = a.$2.source.compareTo(b.$2.source);
      return src != 0 ? src : a.$2.food.name.length.compareTo(b.$2.food.name.length);
    });
    return [for (final h in hits.take(limit)) h.$2.food];
  }

  /// Suggestions for each recognised food, most confident first. A food is
  /// listed once, under the first label that found it.
  List<FoodSuggestionGroup> suggest(List<VisionLabel> labels, {int perLabel = 4, int maxGroups = 5, double minConfidence = 0.1}) {
    final seen = <String>{};
    final groups = <FoodSuggestionGroup>[];
    for (final label in labels) {
      if (groups.length >= maxGroups) break;
      final queries = visionFoodQueries[label.id];
      if (queries == null || label.confidence < minConfidence) continue;
      final foods = <ContentFood>[];
      for (final q in queries) {
        for (final f in search(q, limit: perLabel)) {
          if (foods.length < perLabel && !seen.contains(f.id) && !foods.contains(f)) foods.add(f);
        }
        if (foods.length >= perLabel) break;
      }
      if (foods.isEmpty) continue;
      seen.addAll(foods.map((f) => f.id));
      final first = queries.first;
      final title = _titles[label.id] ?? first[0].toUpperCase() + first.substring(1);
      groups.add(FoodSuggestionGroup(label: label, title: title, foods: foods));
    }
    return groups;
  }
}
