// Siri / Shortcuts / Apple Watch actions for logging food without opening
// the app. They write to the app's own SQLite database (the same file drift
// opens: Documents/forma.sqlite) with the SQL below, which is exercised
// against the real schema by test/watch/intent_sql_test.dart.
//
// No extra entitlement is needed: App Intents work with free signing. On an
// Apple Watch they run through the paired iPhone.
import AppIntents
import Foundation
import SQLite3

// MARK: - Database access

@available(iOS 16.0, *)
enum FormaStore {
  // sql:savedMeals
  static let sqlSavedMeals = """
    SELECT m.id, m.name, COUNT(i.id), SUM(f.kcal100 * i.grams / 100.0)
    FROM saved_meals m
    JOIN saved_meal_items i ON i.meal_id = m.id AND i.deleted_at IS NULL
    JOIN foods f ON f.id = i.food_id
    WHERE m.deleted_at IS NULL
    GROUP BY m.id, m.name
    ORDER BY m.name COLLATE NOCASE
    """

  // sql:recentFoods
  static let sqlRecentFoods = """
    SELECT id, name, COALESCE(serving_g, 100.0), COALESCE(serving_label, '100 g'), kcal100 * COALESCE(serving_g, 100.0) / 100.0
    FROM foods
    WHERE deleted_at IS NULL AND last_used_at IS NOT NULL
    ORDER BY last_used_at DESC
    LIMIT 20
    """

  // sql:mealItems
  static let sqlMealItems = """
    SELECT i.food_id, i.grams
    FROM saved_meal_items i
    JOIN foods f ON f.id = i.food_id
    WHERE i.meal_id = ? AND i.deleted_at IS NULL
    """

  /// Copies a food's nutrients for the amount, like the app does when
  /// logging (unknown values stay NULL). Binds: id, now, now, date, meal,
  /// grams, servings, serving label, now, food id.
  // sql:logFood
  static let sqlLogFood = """
    INSERT INTO nutrition_entries (id, created_at, updated_at, dirty, date, meal, food_id, name, brand, grams, servings, serving_label,
      kcal, protein_g, carbs_g, fat_g, fiber_g, provenance, logged_at)
    SELECT ?1, ?2, ?3, 1, ?4, ?5, f.id, f.name, f.brand, ?6, ?7, ?8,
      f.kcal100 * ?6 / 100.0, f.protein100 * ?6 / 100.0, f.carbs100 * ?6 / 100.0, f.fat100 * ?6 / 100.0, f.fiber100 * ?6 / 100.0,
      f.provenance, ?9
    FROM foods f WHERE f.id = ?10 AND f.deleted_at IS NULL
    """

  // sql:touchFood
  static let sqlTouchFood = "UPDATE foods SET last_used_at = ?1, updated_at = ?1, dirty = 1 WHERE id = ?2"

  enum StoreError: Error, CustomLocalizedStringResourceConvertible {
    case unavailable, notFound
    var localizedStringResource: LocalizedStringResource {
      switch self {
      case .unavailable: return "Open Forma once on this iPhone first."
      case .notFound: return "That item no longer exists in Forma."
      }
    }
  }

  static func open() throws -> OpaquePointer {
    let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let path = dir.appendingPathComponent("forma.sqlite").path
    guard FileManager.default.fileExists(atPath: path) else { throw StoreError.unavailable }
    var db: OpaquePointer?
    guard sqlite3_open_v2(path, &db, SQLITE_OPEN_READWRITE, nil) == SQLITE_OK, let handle = db else {
      sqlite3_close(db)
      throw StoreError.unavailable
    }
    // The app may hold the database open at the same time.
    sqlite3_busy_timeout(handle, 5000)
    sqlite3_exec(handle, "PRAGMA foreign_keys = ON", nil, nil, nil)
    return handle
  }

  private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

  enum Value { case text(String), real(Double), null }

  @discardableResult
  static func run(_ db: OpaquePointer, _ sql: String, _ values: [Value] = [], row: ((OpaquePointer) -> Void)? = nil) throws -> Int32 {
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw StoreError.unavailable }
    defer { sqlite3_finalize(stmt) }
    for (i, v) in values.enumerated() {
      let idx = Int32(i + 1)
      switch v {
      case .text(let s): sqlite3_bind_text(stmt, idx, s, -1, transient)
      case .real(let d): sqlite3_bind_double(stmt, idx, d)
      case .null: sqlite3_bind_null(stmt, idx)
      }
    }
    var rc = sqlite3_step(stmt)
    while rc == SQLITE_ROW {
      row?(stmt!)
      rc = sqlite3_step(stmt)
    }
    guard rc == SQLITE_DONE else { throw StoreError.unavailable }
    return sqlite3_changes(db)
  }

  static func text(_ s: OpaquePointer, _ col: Int32) -> String {
    sqlite3_column_text(s, col).map { String(cString: $0) } ?? ""
  }

  /// Same text format drift uses for dates (UTC ISO-8601).
  static func now() -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.string(from: Date())
  }

  static func today() -> String {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Date())
  }

  /// The meal for the time of day, as in the app (MealSlot.forTime).
  static func currentMeal() -> String {
    let h = Calendar.current.component(.hour, from: Date())
    if h < 10 { return "breakfast" }
    if h < 15 { return "lunch" }
    if h >= 17 && h < 22 { return "dinner" }
    return "snack"
  }

  static func savedMeals() throws -> [SavedMealEntity] {
    let db = try open()
    defer { sqlite3_close(db) }
    var out: [SavedMealEntity] = []
    try run(db, sqlSavedMeals) { s in
      let kcal = sqlite3_column_type(s, 3) == SQLITE_NULL ? nil : sqlite3_column_double(s, 3)
      out.append(SavedMealEntity(id: text(s, 0), name: text(s, 1), items: Int(sqlite3_column_int(s, 2)), kcal: kcal))
    }
    return out
  }

  static func recentFoods() throws -> [FoodEntity] {
    let db = try open()
    defer { sqlite3_close(db) }
    var out: [FoodEntity] = []
    try run(db, sqlRecentFoods) { s in
      let kcal = sqlite3_column_type(s, 4) == SQLITE_NULL ? nil : sqlite3_column_double(s, 4)
      out.append(FoodEntity(id: text(s, 0), name: text(s, 1), grams: sqlite3_column_double(s, 2), portion: text(s, 3), kcal: kcal))
    }
    return out
  }

  private static func logFood(_ db: OpaquePointer, foodId: String, grams: Double, servings: Double?, servingLabel: String?, meal: String, now: String) throws {
    let changed = try run(db, sqlLogFood, [
      .text(UUID().uuidString.lowercased()), .text(now), .text(now), .text(today()), .text(meal),
      .real(grams), servings.map { .real($0) } ?? .null, servingLabel.map { .text($0) } ?? .null, .text(now), .text(foodId),
    ])
    guard changed == 1 else { throw StoreError.notFound }
    try run(db, sqlTouchFood, [.text(now), .text(foodId)])
  }

  static func log(meal: SavedMealEntity) throws {
    let db = try open()
    defer { sqlite3_close(db) }
    var items: [(String, Double)] = []
    try run(db, sqlMealItems, [.text(meal.id)]) { s in items.append((text(s, 0), sqlite3_column_double(s, 1))) }
    guard !items.isEmpty else { throw StoreError.notFound }
    let stamp = FormaStore.now(), slot = currentMeal()
    try run(db, "BEGIN IMMEDIATE")
    do {
      for (food, grams) in items { try logFood(db, foodId: food, grams: grams, servings: nil, servingLabel: nil, meal: slot, now: stamp) }
      try run(db, "COMMIT")
    } catch {
      sqlite3_exec(db, "ROLLBACK", nil, nil, nil)
      throw error
    }
  }

  static func log(food: FoodEntity) throws {
    let db = try open()
    defer { sqlite3_close(db) }
    try logFood(db, foodId: food.id, grams: food.grams, servings: 1, servingLabel: food.portion, meal: currentMeal(), now: FormaStore.now())
  }
}

// MARK: - Entities

@available(iOS 16.0, *)
struct SavedMealEntity: AppEntity {
  let id: String
  let name: String
  let items: Int
  let kcal: Double?

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Saved meal"
  static let defaultQuery = SavedMealQuery()

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)", subtitle: "\(items) items\(kcal.map { " · \(Int($0.rounded())) kcal" } ?? "")")
  }
}

@available(iOS 16.0, *)
struct SavedMealQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [SavedMealEntity] {
    try FormaStore.savedMeals().filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [SavedMealEntity] {
    try FormaStore.savedMeals()
  }
}

@available(iOS 16.0, *)
struct FoodEntity: AppEntity {
  let id: String
  let name: String
  let grams: Double
  let portion: String
  let kcal: Double?

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Food"
  static let defaultQuery = FoodQuery()

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)", subtitle: "\(portion)\(kcal.map { " · \(Int($0.rounded())) kcal" } ?? "")")
  }
}

@available(iOS 16.0, *)
struct FoodQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [FoodEntity] {
    try FormaStore.recentFoods().filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [FoodEntity] {
    try FormaStore.recentFoods()
  }
}

// MARK: - Intents

@available(iOS 16.0, *)
struct LogSavedMealIntent: AppIntent {
  static let title: LocalizedStringResource = "Log Saved Meal"
  static let description = IntentDescription("Logs one of your saved meals in Forma for the current meal of the day.")

  @Parameter(title: "Meal")
  var meal: SavedMealEntity

  func perform() async throws -> some IntentResult & ProvidesDialog {
    try FormaStore.log(meal: meal)
    let kcal = meal.kcal.map { " (\(Int($0.rounded())) kcal)" } ?? ""
    return .result(dialog: "Logged \(meal.name)\(kcal).")
  }
}

@available(iOS 16.0, *)
struct LogRecentFoodIntent: AppIntent {
  static let title: LocalizedStringResource = "Log Recent Food"
  static let description = IntentDescription("Logs one portion of a food you logged recently in Forma.")

  @Parameter(title: "Food")
  var food: FoodEntity

  func perform() async throws -> some IntentResult & ProvidesDialog {
    try FormaStore.log(food: food)
    let kcal = food.kcal.map { " (\(Int($0.rounded())) kcal)" } ?? ""
    return .result(dialog: "Logged \(food.name), \(food.portion)\(kcal).")
  }
}

@available(iOS 16.0, *)
struct FormaShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: LogSavedMealIntent(), phrases: [
      "Log a meal in \(.applicationName)",
      "Log \(\.$meal) in \(.applicationName)",
    ])
    AppShortcut(intent: LogRecentFoodIntent(), phrases: [
      "Log food in \(.applicationName)",
      "Log \(\.$food) in \(.applicationName)",
    ])
  }
}
