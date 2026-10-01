package uk.ac.ic.wlgitbridge.util;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import jakarta.servlet.http.HttpServletRequest;
import java.io.*;
import java.net.URI;
import java.net.URISyntaxException;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.*;

/*
 * Created by Winston on 19/11/14.
 */
public class Util {

  private static String SERVICE_NAME;
  private static String SITE_URL = "";
  private static String SUPPORT_EMAIL = "";
  private static String HOSTNAME;
  private static int PORT;
  private static String POSTBACK_URL;
  private static final DateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSSSSS");

  public static String entries(int entries) {
    if (entries == 1) {
      return "entry";
    } else {
      return "entries";
    }
  }

  public static int booleanToInt(boolean b) {
    if (b) {
      return 1;
    } else {
      return 0;
    }
  }

  public static boolean intToBoolean(int i) {
    return i != 0;
  }

  private static String removeAllSuffix(String str, String suffix) {
    int lastIndexOfSuffix;
    String result = str;
    while ((lastIndexOfSuffix = result.lastIndexOf(suffix)) > -1) {
      result = result.substring(0, lastIndexOfSuffix);
    }
    return result;
  }

  /* removeAllSuffixes("something.git///", "/", ".git") => "something" */
  public static String removeAllSuffixes(String str, String... suffixes) {
    String result = str;
    for (String suffix : suffixes) {
      result = removeAllSuffix(result, suffix);
    }
    return result;
  }

  public static String getContentsOfReader(BufferedReader reader) throws IOException {
    StringBuilder sb = new StringBuilder();
    for (String line; (line = reader.readLine()) != null; ) {
      sb.append(line);
    }
    return sb.toString();
  }

  public static void setServiceName(String serviceName) {
    SERVICE_NAME = serviceName;
  }

  public static String getServiceName() {
    return SERVICE_NAME;
  }

  public static void setSiteUrl(String siteUrl) {
    SITE_URL = siteUrl == null ? "" : siteUrl;
  }

  public static String getSiteUrl() {
    return SITE_URL;
  }

  public static void setSupportEmail(String supportEmail) {
    SUPPORT_EMAIL = supportEmail == null ? "" : supportEmail;
  }

  public static String getSupportEmail() {
    return SUPPORT_EMAIL;
  }

  /*
   * The closing lines of an error message, telling the user where to get help.
   * leadIn is the start of the sentence, e.g. "If this is unexpected".
   */
  public static List<String> getContactLines(String leadIn) {
    boolean hasEmail = !SUPPORT_EMAIL.isEmpty();
    boolean hasSite = !SITE_URL.isEmpty();
    if (hasEmail && hasSite) {
      return Arrays.asList(
          leadIn + ", please contact " + SUPPORT_EMAIL + ", or",
          "see " + getHelpUrl() + " for more information.");
    }
    if (hasEmail) {
      return Arrays.asList(leadIn + ", please contact " + SUPPORT_EMAIL + ".");
    }
    if (hasSite) {
      return Arrays.asList(leadIn + ", see " + getHelpUrl() + " for more information.");
    }
    return Arrays.asList(leadIn + ", please contact the " + getServiceNameOr("site") + " team.");
  }

  /* Lines pointing at the help page, or nothing if the site URL is not configured */
  public static List<String> getHelpPageLines() {
    if (SITE_URL.isEmpty()) {
      return Collections.emptyList();
    }
    return Arrays.asList("", "See the help page for more support:", getHelpUrl());
  }

  public static String getHelpUrl() {
    return SITE_URL + "/learn";
  }

  /* Where users manage their git authentication tokens */
  public static String getAccountSettingsText() {
    String text = "your " + getServiceNameOr("account") + " account settings";
    if (SITE_URL.isEmpty()) {
      return text;
    }
    return text + " (" + SITE_URL + "/user/settings)";
  }

  /*
   * An example git remote URL, e.g. https://git@example.com/git/<YOUR_PROJECT_ID>
   * userInfo is the part before the "@", e.g. "git".
   */
  public static String getGitUrlExample(String userInfo) {
    String scheme = "https";
    String authority = "<YOUR_SITE>";
    String path = "";
    try {
      URI uri = new URI(SITE_URL);
      if (uri.getScheme() != null && uri.getRawAuthority() != null) {
        scheme = uri.getScheme();
        authority = uri.getRawAuthority();
        path = uri.getRawPath() == null ? "" : stripTrailingSlashes(uri.getRawPath());
      }
    } catch (URISyntaxException e) {
      // fall back to the placeholder
    }
    return scheme + "://" + userInfo + "@" + authority + path + "/git/<YOUR_PROJECT_ID>";
  }

  /*
   * The email recorded on commits made by anonymous users: the site's host if
   * known, otherwise a name under the reserved .invalid domain.
   */
  public static String getAnonymousEmail() {
    try {
      String host = new URI(SITE_URL).getHost();
      if (host != null && !host.isEmpty()) {
        return "anonymous@" + host;
      }
    } catch (URISyntaxException e) {
      // fall back to the service name
    }
    String slug =
        getServiceNameOr("")
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("^-+|-+$", "");
    return "anonymous@" + (slug.isEmpty() ? "localhost" : slug) + ".invalid";
  }

  /* "https://example.com//" => "https://example.com" */
  public static String stripTrailingSlashes(String str) {
    String result = str;
    while (result.endsWith("/")) {
      result = result.substring(0, result.length() - 1);
    }
    return result;
  }

  private static String getServiceNameOr(String fallback) {
    return SERVICE_NAME == null || SERVICE_NAME.isEmpty() ? fallback : SERVICE_NAME;
  }

  public static int getPort() {
    return PORT;
  }

  public static void setPort(int port) {
    PORT = port;
  }

  public static void setPostbackURL(String postbackURL) {
    POSTBACK_URL = postbackURL;
  }

  public static String getPostbackURL() {
    return POSTBACK_URL;
  }

  public static void deleteDirectory(File directory) {
    if (directory != null) {
      deleteInDirectory(directory);
      directory.delete();
    }
  }

  public static void deleteInDirectory(File directory) {
    if (directory != null) {
      deleteInDirectoryApartFrom(directory);
    }
  }

  public static void deleteInDirectoryApartFrom(File directory, String... apartFrom) {
    if (directory != null) {
      Set<String> excluded = new HashSet<>(Arrays.asList(apartFrom));
      File[] files = directory.listFiles();
      if (files != null) {
        for (File file : files) {
          if (!excluded.contains(file.getName())) {
            if (java.nio.file.Files.isDirectory(
                file.toPath(), java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
              deleteInDirectory(file);
            }
            file.delete();
            Log.debug("Deleted file: {}", file.getAbsolutePath());
          }
        }
      }
    }
  }

  public static List<String> linesFromStream(InputStream stream, int skip, String trimSuffix)
      throws IOException {
    List<String> lines = new ArrayList<>();
    BufferedReader reader = new BufferedReader(new InputStreamReader(stream));
    String line;
    for (int i = 0; i < skip; i++) {
      reader.readLine();
    }
    while ((line = reader.readLine()) != null) {
      String trim = line.trim();
      trim = trim.replaceAll("\\p{C}", "");
      int endIndex = trim.lastIndexOf(trimSuffix);
      if (endIndex >= 0) {
        trim = trim.substring(0, endIndex);
      }
      lines.add(trim);
    }
    return lines;
  }

  public static String fromStream(InputStream stream, int skip) throws IOException {
    BufferedReader reader = new BufferedReader(new InputStreamReader(stream));
    StringBuilder out = new StringBuilder();
    String newLine = System.getProperty("line.separator");
    String line;
    for (int i = 0; i < skip; i++) {
      reader.readLine();
    }
    while ((line = reader.readLine()) != null) {
      out.append(line);
      out.append(newLine);
    }
    return out.toString();
  }

  public static String fromStream(InputStream stream) throws IOException {
    return fromStream(stream, 0);
  }

  public static String getClientIp(HttpServletRequest request) {
    String clientIp = request.getHeader("X-Forwarded-For");
    if (clientIp != null) {
      clientIp = clientIp.split(",", 2)[0].trim();
    }
    if (clientIp == null || clientIp.isEmpty()) {
      clientIp = request.getRemoteAddr();
    }
    return clientIp;
  }

  public static String getCodeFromResponse(JsonObject json) {
    String code = "error";
    JsonElement codeElement = json.get("code");

    if (codeElement == null) {
      String error = "Unexpected error";
      Log.warn("Unexpected response from API:");
      Log.warn(json.toString());
      Log.warn("End of response");
      JsonElement statusElement = json.get("status");
      if (statusElement != null) {
        String status = statusElement.getAsString();
        if (status.equals("422")) {
          error = "Unprocessable entity";
        } else if (status.equals("404")) {
          error = "Not found";
        } else if (status.equals("403")) {
          error = "Forbidden";
        }
      }
      throw new RuntimeException(error);
    } else {
      code = codeElement.getAsString();
    }
    return code;
  }
}
