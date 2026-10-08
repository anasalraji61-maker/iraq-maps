// JPEG thumbnails of screenshots for screenshots-summary.sh, with the JDK alone (the e2e job already sets one up).
// Run as a single-file program: java -Djava.awt.headless=true Thumbnails.java <out-dir> <png>...
// The i-th PNG (from 0) becomes <out-dir>/<i>-480.jpg and <i>-240.jpg, that many pixels wide (area-averaged).
import java.awt.Image;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.FileImageOutputStream;

class Thumbnails {
  public static void main(String[] args) throws Exception {
    for (int i = 1; i < args.length; i++) {
      BufferedImage png = ImageIO.read(new File(args[i]));
      for (int width : new int[] {480, 240}) write(png, width, new File(args[0], (i - 1) + "-" + width + ".jpg"));
    }
  }

  static void write(BufferedImage png, int width, File file) throws Exception {
    int height = png.getHeight() * width / png.getWidth();
    BufferedImage thumb = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
    thumb.createGraphics().drawImage(png.getScaledInstance(width, height, Image.SCALE_AREA_AVERAGING), 0, 0, null);
    ImageWriter jpeg = ImageIO.getImageWritersByFormatName("jpeg").next();
    ImageWriteParam quality = jpeg.getDefaultWriteParam();
    quality.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
    quality.setCompressionQuality(0.75f);
    try (FileImageOutputStream out = new FileImageOutputStream(file)) {
      jpeg.setOutput(out);
      jpeg.write(null, new IIOImage(thumb, null, null), quality);
    }
    jpeg.dispose();
  }
}
