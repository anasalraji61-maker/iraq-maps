package iq.iraqmaps.tiles;

import static java.util.stream.Collectors.groupingBy;
import static java.util.stream.Collectors.mapping;
import static java.util.stream.Collectors.toMap;
import static java.util.stream.Collectors.toSet;

import com.onthegomap.planetiler.FeatureCollector;
import com.onthegomap.planetiler.Profile;
import com.onthegomap.planetiler.reader.SourceFeature;
import com.onthegomap.planetiler.reader.osm.OsmElement;
import com.onthegomap.planetiler.reader.osm.OsmRelationInfo;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Planetiler profile for one city, OSM data only. Layers, geometry types, classes and fields come from TileSchema;
 * this class holds only the OSM tag to class mapping, which must cover exactly the schema's classes.
 */
final class CityProfile implements Profile {
  /**
   * layer, class, min zoom, an optional geometry to keep to (a closed waterway=river is still a centreline), then tag
   * conditions that must all match: key=v1,v2 or key=* (any value but "no"). Per layer the first matching rule wins, so
   * one element can land in several layers (a park is landuse and poi). poi classes are PlaceCategory values; POIs that
   * fit no rule are dropped.
   */
  private static final String RULES = """
      place          city           4 place=city
      place          town           8 place=town
      place          village       10 place=village
      place          suburb        11 place=suburb
      place          quarter       12 place=quarter
      place          neighbourhood 13 place=neighbourhood
      transportation motorway       5 highway=motorway,motorway_link
      transportation trunk          6 highway=trunk,trunk_link
      transportation primary        8 highway=primary,primary_link
      transportation secondary      9 highway=secondary,secondary_link
      transportation tertiary      10 highway=tertiary,tertiary_link
      transportation minor         12 highway=residential,unclassified,living_street,road
      transportation service       13 highway=service
      transportation path          13 highway=footway,path,pedestrian,cycleway,steps,track
      poi            food          14 amenity=restaurant,fast_food,food_court,ice_cream
      poi            cafe          14 amenity=cafe,hookah_lounge
      poi            health        14 amenity=hospital,clinic,doctors,dentist,pharmacy
      poi            finance       14 amenity=bank,atm,bureau_de_change,money_transfer
      poi            fuel          14 amenity=fuel
      poi            worship       14 amenity=place_of_worship
      poi            education     14 amenity=school,university,college,kindergarten,library
      poi            government    14 amenity=townhall,police,courthouse,fire_station,post_office
      poi            transport     14 amenity=bus_station,taxi,ferry_terminal
      poi            entertainment 14 amenity=cinema,theatre,arts_centre
      poi            shopping      14 amenity=marketplace
      poi            lodging       14 tourism=hotel,hostel,guest_house,motel,apartment
      poi            entertainment 14 tourism=theme_park,zoo
      poi            tourism       14 tourism=attraction,museum,viewpoint,gallery,artwork
      poi            health        14 healthcare=*
      poi            government    14 office=government
      poi            office        14 office=*
      poi            shopping      14 shop=*
      poi            entertainment 14 leisure=park,stadium,sports_centre,fitness_centre,water_park,amusement_arcade
      poi            transport     14 railway=station
      poi            transport     14 aeroway=aerodrome
      poi            tourism       14 historic=*
      building       building      13 building=*
      water          river          8 line waterway=river
      water          canal         11 line waterway=canal
      water          river          4 waterway=riverbank
      water          river          4 natural=water water=river
      water          canal          4 natural=water water=canal
      water          lake           4 natural=water
      landuse        residential   10 landuse=residential
      landuse        commercial    10 landuse=commercial,retail
      landuse        industrial    10 landuse=industrial
      landuse        park          10 leisure=park,garden
      landuse        grass         10 landuse=grass,meadow,village_green
      landuse        cemetery      10 landuse=cemetery
      landuse        cemetery      10 amenity=grave_yard
      landuse        farmland      10 landuse=farmland,orchard
      boundary       country        0 boundary=administrative admin_level=2
      boundary       province       4 boundary=administrative admin_level=3,4
      boundary       district       8 boundary=administrative admin_level=5,6
      """;

  private record Rule(String layer, String cls, int minZoom, String geometry, Map<String, Set<String>> tags) {
    static Rule parse(String line) {
      String[] f = line.trim().split("\\s+");
      int tags = f[3].contains("=") ? 3 : 4;
      return new Rule(f[0], f[1], Integer.parseInt(f[2]), tags == 4 ? f[3] : null, Arrays.stream(f, tags, f.length)
          .map(c -> c.split("=", 2)).collect(toMap(c -> c[0], c -> Set.of(c[1].split(",")))));
    }

    boolean matches(Map<String, Object> element) {
      return tags.entrySet().stream().allMatch(t -> {
        Object value = element.get(t.getKey());
        return value != null && !"no".equals(value) && (t.getValue().contains("*") || t.getValue().contains(value));
      });
    }
  }

  private record AdminBoundary(long id, long level) implements OsmRelationInfo {}

  private final TileSchema schema;
  private final List<Rule> rules = RULES.lines().map(Rule::parse).toList();

  CityProfile(TileSchema schema) {
    this.schema = schema;
    var mapped = rules.stream().collect(groupingBy(Rule::layer, mapping(Rule::cls, toSet())));
    var expected = schema.layers().entrySet().stream().collect(toMap(Map.Entry::getKey, e -> Set.copyOf(e.getValue().classes())));
    if (!mapped.equals(expected)) {
      throw new IllegalStateException("the OSM mapping " + mapped + " does not cover exactly the TileSchema classes " + expected);
    }
  }

  @Override
  public String name() {
    return "iraq-maps";
  }

  @Override
  public String attribution() {
    return OSM_ATTRIBUTION;
  }

  @Override
  public List<OsmRelationInfo> preprocessOsmRelation(OsmElement.Relation relation) {
    long level = relation.getLong("admin_level");
    return relation.hasTag("type", "boundary") && relation.hasTag("boundary", "administrative") && level > 0
        ? List.of(new AdminBoundary(relation.id(), level))
        : null;
  }

  @Override
  public void processFeature(SourceFeature element, FeatureCollector features) {
    var tags = withBoundary(element);
    Set<String> layers = new HashSet<>();
    for (Rule rule : rules) {
      if (layers.contains(rule.layer()) || !rule.matches(tags)) {
        continue;
      }
      layers.add(rule.layer());
      var feature = geometry(features, rule, element);
      if (feature != null) {
        // A way that is a boundary only through its relations does not lend the boundary its own (road, river) names.
        boolean named = rule.matches(element.tags());
        feature.setMinZoom(rule.minZoom());
        schema.fields().forEach(f -> feature.setAttr(f, f.equals("class") ? rule.cls() : named ? element.getString(f) : null));
      }
    }
  }

  /** A way in administrative boundary relations takes boundary=administrative and their lowest admin_level. */
  private static Map<String, Object> withBoundary(SourceFeature element) {
    var level = element.relationInfo(AdminBoundary.class).stream().mapToLong(m -> m.relation().level()).min();
    if (level.isEmpty()) {
      return element.tags();
    }
    Map<String, Object> tags = new HashMap<>(element.tags());
    tags.put("boundary", "administrative");
    tags.put("admin_level", Long.toString(level.getAsLong()));
    return tags;
  }

  /** A geometry the layer and rule allow and the element can take, preferring polygon, line, point; areas give a point inside. */
  private FeatureCollector.Feature geometry(FeatureCollector features, Rule rule, SourceFeature element) {
    String layer = rule.layer();
    var types = schema.layers().get(layer).geometry().stream().filter(t -> rule.geometry() == null || t.equals(rule.geometry())).toList();
    if (types.contains("polygon") && element.canBePolygon()) {
      return features.polygon(layer);
    }
    if (types.contains("line") && element.canBeLine()) {
      return features.line(layer);
    }
    if (types.contains("point") && (element.isPoint() || element.canBePolygon())) {
      return element.isPoint() ? features.point(layer) : features.pointOnSurface(layer);
    }
    return null;
  }
}
