package iq.iraqmaps.tiles;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.onthegomap.planetiler.VectorTile;
import com.onthegomap.planetiler.geo.GeometryType;
import com.onthegomap.planetiler.pmtiles.Pmtiles;
import com.onthegomap.planetiler.pmtiles.ReadablePmtiles;
import com.onthegomap.planetiler.util.FileUtils;
import com.onthegomap.planetiler.util.Gzip;
import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** Acceptance #2 of M1: the fixture builds into PMTiles with exactly the TileSchema layers and fields, plus the glyphs. */
class TilesTest {
  private static final Path PBF = Path.of("target/city.osm.pbf");
  private static final Path PMTILES = Path.of("target/city.pmtiles");
  private static final String BBOX = "44.39,33.29,44.43,33.33";
  private static TileSchema schema;
  private static Pmtiles.Header header;
  /** Every feature of every tile, keyed by its zoom. */
  private static final Map<Integer, List<VectorTile.Feature>> features = new HashMap<>();

  @BeforeAll
  static void build() throws Exception {
    schema = TileSchema.read();
    assertEquals(0, run("osmium", "cat", "--overwrite", "-o", PBF.toString(), "src/test/fixtures/city.osm"));
    tiles(PBF, PMTILES, BBOX);
    try (var archive = new ReadablePmtiles(FileChannel.open(PMTILES)); var tiles = archive.getAllTiles()) {
      header = archive.getHeader();
      while (tiles.hasNext()) {
        var tile = tiles.next();
        byte[] mvt = header.tileCompression() == Pmtiles.Compression.GZIP ? Gzip.gunzip(tile.bytes()) : tile.bytes();
        features.computeIfAbsent(tile.coord().z(), z -> new ArrayList<>()).addAll(VectorTile.decode(mvt));
      }
    }
  }

  @Test
  void headerHasTheSchemaZoomsAndTheBbox() {
    assertEquals(Pmtiles.TileType.MVT, header.tileType());
    assertEquals(schema.minZoom(), header.minZoom());
    assertEquals(schema.maxZoom(), header.maxZoom());
    var bounds = String.format(Locale.ROOT, "%.2f,%.2f,%.2f,%.2f", header.minLonE7() / 1e7, header.minLatE7() / 1e7, header.maxLonE7() / 1e7, header.maxLatE7() / 1e7);
    assertEquals(BBOX, bounds);
    assertTrue(features.keySet().stream().allMatch(z -> z >= schema.minZoom() && z <= schema.maxZoom()));
  }

  @Test
  void everyFeatureFollowsTheSchemaAndTheFixtureCoversAllOfIt() {
    Set<String> layers = new HashSet<>();
    Set<String> fields = new HashSet<>();
    for (var feature : features.values().stream().flatMap(List::stream).toList()) {
      var layer = schema.layers().get(feature.layer());
      assertNotNull(layer, feature.layer());
      assertTrue(layer.geometry().contains(feature.geometry().geomType().name().toLowerCase()), feature.toString());
      assertTrue(layer.classes().contains(feature.attrs().get("class")), feature.toString());
      assertTrue(schema.fields().containsAll(feature.attrs().keySet()), feature.toString());
      layers.add(feature.layer());
      fields.addAll(feature.attrs().keySet());
    }
    assertEquals(schema.layers().keySet(), layers);
    assertEquals(Set.copyOf(schema.fields()), fields);
  }

  @Test
  void featuresCarryTheirClassAndNamesAtTheirZooms() {
    var maxZoom = features.get(schema.maxZoom());
    var attrs = maxZoom.stream().map(VectorTile.Feature::attrs).toList();
    assertTrue(attrs.contains(Map.of("class", "suburb", "name", "الكرادة", "name:ar", "الكرادة", "name:ckb", "کەڕادە", "name:en", "Karrada")));
    assertTrue(attrs.contains(Map.of("class", "tourism", "name", "القلعة", "name:ar", "القلعة", "name:en", "Citadel")));
    assertTrue(attrs.contains(Map.of("class", "food", "name", "مطعم الساعة")));
    // The Tigris (way 400) is also a district boundary, whose line must not take the river's names.
    var boundaries = maxZoom.stream().filter(f -> f.layer().equals("boundary")).map(VectorTile.Feature::attrs).collect(Collectors.toSet());
    assertEquals(Set.of(Map.of("class", "province"), Map.of("class", "district")), boundaries);
    // Planetiler feature ids are OSM id * 10 + 1 (node) or 2 (way); node 4 (amenity=bench) fits no PlaceCategory.
    var poiIds = maxZoom.stream().filter(f -> f.layer().equals("poi")).map(VectorTile.Feature::id).collect(Collectors.toSet());
    assertEquals(Set.of(21L, 31L, 2002L, 3002L), poiIds);
    var poiZooms = features.entrySet().stream().filter(e -> e.getValue().stream().anyMatch(f -> f.layer().equals("poi"))).map(Map.Entry::getKey).toList();
    assertEquals(List.of(schema.maxZoom()), poiZooms);
  }

  /** The ring canal (way 401) is a closed waterway=canal, still a centreline rather than a filled area. */
  @Test
  void closedWaterwaysStayLines() {
    var canal = features.get(schema.maxZoom()).stream().filter(f -> f.id() == 4012).toList();
    assertFalse(canal.isEmpty());
    assertTrue(canal.stream().allMatch(f -> f.layer().equals("water") && f.geometry().geomType() == GeometryType.LINE), canal.toString());
  }

  @Test
  void buildRejectsBadArguments() throws IOException {
    for (var bbox : List.of("44.43,33.29,44.39,33.33", "44,33,45", "a,b,c,d", "44,33,45,91")) {
      assertThrows(IllegalArgumentException.class, () -> tiles(PBF, "x.pmtiles", bbox));
    }
    assertThrows(IllegalArgumentException.class, () -> tiles("missing.osm.pbf", "x.pmtiles", BBOX));
    assertThrows(IllegalArgumentException.class, () -> tiles(PBF, "x.mbtiles", BBOX));
    var dir = Files.createDirectories(Path.of("target/dir.pmtiles"));
    assertThrows(IllegalArgumentException.class, () -> tiles(PBF, dir, BBOX));
    assertThrows(IllegalArgumentException.class, () -> TilesCli.build("--input", PBF.toString(), "--bbox", BBOX, "--force"));
  }

  /** Planetiler empties its output before it reads the input, so the build must not write to --output until it succeeds. */
  @Test
  void failedBuildKeepsThePreviousArchive() throws IOException {
    var previous = Files.copy(PMTILES, Path.of("target/previous.pmtiles"), StandardCopyOption.REPLACE_EXISTING);
    var corrupt = Files.writeString(Path.of("target/corrupt.osm.pbf"), "not a pbf");
    assertThrows(RuntimeException.class, () -> tiles(corrupt, previous, BBOX));
    assertEquals(-1, Files.mismatch(PMTILES, previous));
    try (var target = Files.list(Path.of("target"))) {
      assertEquals(List.of(), target.filter(p -> p.getFileName().toString().startsWith(".tiles-")).toList());
    }
  }

  /** Glyphs.requiredRanges exist with glyphs in them (a range without glyphs is about 40 bytes), next to the OFL. */
  @Test
  void glyphsCoverTheRequiredRanges() throws Exception {
    assertEquals(2, run("sh", "scripts/tiles.sh", "glyphs"));
    FileUtils.delete(Path.of("target/glyphs"));
    assertEquals(0, run("sh", "scripts/tiles.sh", "glyphs", "--output", "target/glyphs"));
    // Read from the TS contract until Glyphs has a JSON export (docs/contract-requests/M1-builder-tiles.md #1).
    var glyphs = Files.readString(Path.of("../../packages/contracts/src/geo-data.ts"));
    var fontstack = Pattern.compile("fontstack: '([^']+)'").matcher(glyphs).results().findFirst().orElseThrow().group(1);
    var ranges = Pattern.compile("requiredRanges: \\[([^]]+)]").matcher(glyphs).results().findFirst().orElseThrow().group(1);
    var required = Pattern.compile("'(\\d+-\\d+)'").matcher(ranges).results().map(m -> m.group(1)).toList();
    assertFalse(required.isEmpty());
    for (var range : required) {
      var pbf = Path.of("target/glyphs", fontstack, range + ".pbf");
      assertTrue(Files.isRegularFile(pbf) && Files.size(pbf) > 1024, pbf.toString());
    }
    assertTrue(Files.readString(Path.of("target/glyphs", fontstack, "OFL.txt")).contains("SIL Open Font License, Version 1.1"));
  }

  private static void tiles(Object input, Object output, String bbox) throws IOException {
    TilesCli.build("--input", input.toString(), "--output", output.toString(), "--bbox", bbox);
  }

  // stdin and stdout are Surefire's channel to the forked JVM: a node child that inherits stdin makes it non-blocking and
  // the fork dies with "std/in stream corrupted" (seen under turbo), and child stdout would corrupt the event stream.
  private static int run(String... command) throws Exception {
    return new ProcessBuilder(command).redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.INHERIT).start().waitFor();
  }
}
