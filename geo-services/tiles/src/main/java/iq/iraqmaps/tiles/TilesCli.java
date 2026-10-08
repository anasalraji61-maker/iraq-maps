package iq.iraqmaps.tiles;

import com.onthegomap.planetiler.Planetiler;
import com.onthegomap.planetiler.config.Arguments;
import com.onthegomap.planetiler.util.FileUtils;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.snakeyaml.engine.v2.api.Load;
import org.snakeyaml.engine.v2.api.LoadSettings;

/**
 * Entry point of `tiles build --input <clipped.osm.pbf> --output <city.pmtiles> --bbox w,s,e,n [--city <city.yaml>]`
 * (CliContracts.tilesBuild in packages/contracts), run by scripts/tiles.sh from the package directory. --city is the
 * city config (geo-services/pipeline/cities/<id>.yaml) whose categories limit the poi layer; without it all are kept.
 */
public final class TilesCli {
  private static final String USAGE = "usage: tiles build --input <clipped.osm.pbf> --output <city.pmtiles> --bbox w,s,e,n [--city <city.yaml>]";
  private static final String NUMBER = "-?\\d{1,3}(\\.\\d{1,15})?";

  private TilesCli() {}

  public static void main(String[] args) throws IOException {
    try {
      build(args);
    } catch (IllegalArgumentException e) {
      System.err.println("tiles build: " + e.getMessage() + "\n" + USAGE);
      System.exit(2);
    }
  }

  static void build(String... args) throws IOException {
    Map<String, String> opts = new HashMap<>();
    for (int i = 0; i < args.length; i += 2) {
      require(Set.of("--input", "--output", "--bbox", "--city").contains(args[i]) && i + 1 < args.length, "unexpected argument " + args[i]);
      require(opts.put(args[i], args[i + 1]) == null, args[i] + " given twice");
    }
    require(opts.keySet().containsAll(Set.of("--input", "--output", "--bbox")), "--input, --output and --bbox are required");
    Path input = Path.of(opts.get("--input"));
    Path output = Path.of(opts.get("--output"));
    String bbox = opts.get("--bbox");
    require(Files.isRegularFile(input) && input.toString().endsWith(".osm.pbf"), "--input must be an existing .osm.pbf file");
    require(output.toString().endsWith(".pmtiles") && !Files.isDirectory(output), "--output must be a .pmtiles file, not a directory");
    require(bbox.matches(NUMBER + "(," + NUMBER + "){3}"), "--bbox must be west,south,east,north in degrees");
    double[] b = Arrays.stream(bbox.split(",")).mapToDouble(Double::parseDouble).toArray();
    require(-180 <= b[0] && b[0] < b[2] && b[2] <= 180 && -90 <= b[1] && b[1] < b[3] && b[3] <= 90, "--bbox is not a WGS84 box");
    OsmCategories categories = OsmCategories.read();
    Set<String> enabled = opts.containsKey("--city") ? cityCategories(Path.of(opts.get("--city")), categories.categories()) : categories.categories();

    TileSchema schema = TileSchema.read();
    Path tmp = Files.createTempDirectory("tiles");
    // Planetiler empties its output before it reads the input, so build beside --output and replace it only on success.
    Path built = Files.createTempFile(Files.createDirectories(output.toAbsolutePath().getParent()), ".tiles-", ".pmtiles");
    try {
      Planetiler.create(Arguments.of("minzoom", schema.minZoom(), "maxzoom", schema.maxZoom(), "bounds", bbox, "tmpdir", tmp))
          .setProfile(new CityProfile(schema, categories, enabled))
          .addOsmSource("osm", input)
          .overwriteOutput(built)
          .run();
      Files.move(built, output, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    } finally {
      Files.deleteIfExists(built);
      FileUtils.delete(tmp);
    }
  }

  /** The `categories` of a city config, each one of the shared table's PlaceCategory values. */
  private static Set<String> cityCategories(Path yaml, Set<String> known) throws IOException {
    require(Files.isRegularFile(yaml), "--city must be an existing city config (.yaml)");
    Object config;
    try (var in = Files.newInputStream(yaml)) {
      config = new Load(LoadSettings.builder().build()).loadFromInputStream(in);
    }
    Object categories = config instanceof Map<?, ?> map ? map.get("categories") : null;
    require(categories instanceof List<?> list && !list.isEmpty() && known.containsAll(list), "--city " + yaml + " needs a categories list of PlaceCategory values");
    return ((List<?>) categories).stream().map(String.class::cast).collect(Collectors.toSet());
  }

  private static void require(boolean ok, String problem) {
    if (!ok) {
      throw new IllegalArgumentException(problem);
    }
  }
}
