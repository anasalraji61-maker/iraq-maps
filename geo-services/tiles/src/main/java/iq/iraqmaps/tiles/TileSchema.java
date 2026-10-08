package iq.iraqmaps.tiles;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/** TileSchema from packages/contracts, read from its JSON export. Paths resolve against the package directory. */
record TileSchema(int minZoom, int maxZoom, List<String> fields, Map<String, Layer> layers) {
  record Layer(List<String> geometry, List<String> classes) {}

  static final Path PATH = Path.of("../../packages/contracts/schemas/tile-schema.json");

  static TileSchema read() throws IOException {
    return new ObjectMapper().readValue(PATH.toFile(), TileSchema.class);
  }
}
