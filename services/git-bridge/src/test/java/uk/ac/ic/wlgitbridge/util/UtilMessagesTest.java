package uk.ac.ic.wlgitbridge.util;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.Collections;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class UtilMessagesTest {

  @Before
  public void setUp() {
    Util.setServiceName("Latex X IIT-Mandi");
    Util.setSiteUrl("");
    Util.setSupportEmail("");
  }

  @After
  public void tearDown() {
    Util.setSiteUrl("");
    Util.setSupportEmail("");
  }

  @Test
  public void contactLinesWithEmailAndSite() {
    Util.setSiteUrl("https://latex.example.org");
    Util.setSupportEmail("help@example.org");
    assertEquals(
        Arrays.asList(
            "If this is unexpected, please contact help@example.org, or",
            "see https://latex.example.org/learn for more information."),
        Util.getContactLines("If this is unexpected"));
  }

  @Test
  public void contactLinesWithEmailOnly() {
    Util.setSupportEmail("help@example.org");
    assertEquals(
        Arrays.asList("If this is unexpected, please contact help@example.org."),
        Util.getContactLines("If this is unexpected"));
  }

  @Test
  public void contactLinesWithSiteOnly() {
    Util.setSiteUrl("https://latex.example.org");
    assertEquals(
        Arrays.asList(
            "If this error persists, see https://latex.example.org/learn for more information."),
        Util.getContactLines("If this error persists"));
  }

  @Test
  public void contactLinesWithNeither() {
    assertEquals(
        Arrays.asList("If this does not work, please contact the Latex X IIT-Mandi team."),
        Util.getContactLines("If this does not work"));
  }

  @Test
  public void helpPageLines() {
    assertEquals(Collections.emptyList(), Util.getHelpPageLines());
    Util.setSiteUrl("https://latex.example.org");
    assertEquals(
        Arrays.asList("", "See the help page for more support:", "https://latex.example.org/learn"),
        Util.getHelpPageLines());
  }

  @Test
  public void accountSettingsText() {
    assertEquals("your Latex X IIT-Mandi account settings", Util.getAccountSettingsText());
    Util.setSiteUrl("https://latex.example.org");
    assertEquals(
        "your Latex X IIT-Mandi account settings (https://latex.example.org/user/settings)",
        Util.getAccountSettingsText());
  }

  @Test
  public void gitUrlExample() {
    assertEquals("https://git@<YOUR_SITE>/git/<YOUR_PROJECT_ID>", Util.getGitUrlExample("git"));
    Util.setSiteUrl("https://latex.example.org");
    assertEquals(
        "https://git@latex.example.org/git/<YOUR_PROJECT_ID>", Util.getGitUrlExample("git"));
    Util.setSiteUrl("http://localhost:8080/sub/");
    assertEquals(
        "http://git:<TOKEN>@localhost:8080/sub/git/<YOUR_PROJECT_ID>",
        Util.getGitUrlExample("git:<TOKEN>"));
  }

  @Test
  public void anonymousEmail() {
    assertEquals("anonymous@latex-x-iit-mandi.invalid", Util.getAnonymousEmail());
    Util.setSiteUrl("https://latex.example.org");
    assertEquals("anonymous@latex.example.org", Util.getAnonymousEmail());
  }
}
