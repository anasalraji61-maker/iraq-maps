package iq.iraqmaps.tiles;

import static java.util.stream.Collectors.toSet;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The OSM tag to PlaceCategory rules from packages/contracts, read from schemas/osm-categories.json, which the pipeline
 * reads too. Rules are tried in order and the first that yields a category wins; within a rule an exact value beats "*",
 * and a value in ignoredValues never matches.
 */
record OsmCategories(List<String> ignoredValues, List<Rule> rules) {
  record Rule(String key, Map<String, String> values) {}

  static final Path PATH = Path.of("../../packages/contracts/schemas/osm-categories.json");

  static OsmCategories read() throws IOException {
    return new ObjectMapper().readValue(PATH.toFile(), OsmCategories.class);
  }

  /**
   * The element's PlaceCategory, or null when no rule yields one or the city does not enable the one the first rule
   * yields (the element is dropped, not given a later rule's category). The pipeline extract decides the same way, and
   * schemas/osm-category-cases.json holds the cases both must pass, so map POIs and search agree.
   */
  String categoryOf(Map<String, Object> tags, Set<String> enabled) {
    for (Rule rule : rules) {
      if (tags.get(rule.key()) instanceof String value && !ignoredValues.contains(value)) {
        String category = rule.values().getOrDefault(value, rule.values().get("*"));
        if (category != null) {
          return enabled.contains(category) ? category : null;
        }
      }
    }
    return null;
  }

  Set<String> categories() {
    return rules.stream().flatMap(r -> r.values().values().stream()).collect(toSet());
  }
}
