package uk.ac.ic.wlgitbridge.snapshot.base;

import com.google.gson.JsonElement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import uk.ac.ic.wlgitbridge.git.exception.SnapshotAPIException;
import uk.ac.ic.wlgitbridge.util.Util;

public class MissingRepositoryException extends SnapshotAPIException {

  /*
   * Messages are built when they are needed, not at class-load time, so that
   * they use the service name and contact details from the config.
   */
  public static List<String> genericReason() {
    return withContactLines(
        "If this is unexpected",
        "This " + Util.getServiceName() + " project currently has no git access, either because",
        "the project does not exist, or because git access is not enabled",
        "for the project.",
        "");
  }

  static List<String> buildDeprecatedMessage(String newUrl) {
    if (newUrl == null) {
      return withContactLines(
          "If this is unexpected",
          "This project has to be moved to the current version of "
              + Util.getServiceName()
              + " before you",
          "can keep working on it. Open the project in your browser to do this.",
          "",
          "After it has moved, you will be prompted to update your git remote to the",
          "project's new identifier.",
          "");
    } else {
      return withContactLines(
          "If this is unexpected",
          "This project has to be moved to the current version of "
              + Util.getServiceName()
              + " before you",
          "can keep working on it. Open the project in your browser to do this:",
          "",
          "    " + newUrl,
          "",
          "After it has moved, you will be prompted to update your git remote to the",
          "project's new identifier.",
          "");
    }
  }

  static List<String> buildExportedToV2Message(String remoteUrl) {
    if (remoteUrl == null) {
      return withContactLines(
          "If this error persists",
          "This project has moved and cannot be used with git at this time.",
          "");
    } else {
      return withContactLines(
          "If this does not work",
          "This project has moved and has a new identifier.",
          "Please update your remote to:",
          "",
          "    " + remoteUrl,
          "",
          "Assuming you are using the default \"origin\" remote, the following commands",
          "will change the remote for you:",
          "",
          "    git remote set-url origin " + remoteUrl,
          "");
    }
  }

  static List<String> withContactLines(String leadIn, String... lines) {
    List<String> result = new ArrayList<>(Arrays.asList(lines));
    result.addAll(Util.getContactLines(leadIn));
    return result;
  }

  private List<String> descriptionLines;

  public MissingRepositoryException() {
    this.descriptionLines = genericReason();
  }

  public MissingRepositoryException(List<String> descriptionLines) {
    this.descriptionLines = descriptionLines;
  }

  @Override
  public void fromJSON(JsonElement json) {}

  @Override
  public String getMessage() {
    return "no git access";
  }

  @Override
  public List<String> getDescriptionLines() {
    return this.descriptionLines;
  }
}
