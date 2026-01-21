var DEBUG = false;

function showNotice(msg, timeout) {
  timeout = timeout || 3000;
  try {
    if (typeof Notice !== "undefined") {
      new Notice(msg, timeout);
    } else if (typeof window !== "undefined" && typeof window.Notice !== "undefined") {
      new window.Notice(msg, timeout);
    } else {
      console.log("Templater notice:", msg);
    }
  } catch (e) {
    console.log("Templater notice error:", e, msg);
  }
}

function debug(msg) {
  if (DEBUG) {
    showNotice("extractLog: " + msg, 4000);
  }
}

// Get Obsidian app in a way that works on mobile & desktop
function getObsidianApp(tp) {
  if (typeof app !== "undefined") {
    return app;  // global Obsidian app (works on mobile)
  }
  if (tp && tp.app) {
    return tp.app;
  }
  throw new Error("Obsidian app object not available");
}

// --- indentation helpers ---

function countIndent(line) {
  var i = 0;
  while (i < line.length) {
    var c = line.charAt(i);
    if (c === " " || c === "\t") {
      i++;
    } else {
      break;
    }
  }
  return i;
}

// Remove the minimal common leading indent from all non-blank lines,
// preserving relative indentation.
function dedentLines(lines) {
  var minIndent = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.trim() === "") continue;
    var ind = countIndent(line);
    if (minIndent === null || ind < minIndent) {
      minIndent = ind;
    }
  }

  if (minIndent === null || minIndent === 0) {
    return lines.slice();
  }

  var out = [];
  for (var j = 0; j < lines.length; j++) {
    var l = lines[j];
    if (l.trim() === "") {
      out.push("");
    } else {
      var remove = minIndent;
      var k = 0;
      while (k < l.length && remove > 0) {
        var ch = l.charAt(k);
        if (ch === " " || ch === "\t") {
          k++;
          remove--;
        } else {
          break;
        }
      }
      out.push(l.slice(k));
    }
  }
  return out;
}

// --- list prefix / checkbox helpers ---

// Single source of truth for list prefix + checkbox:
// - optional leading whitespace
// - a bullet marker: -, * or +
// - at least one space
// - optional checkbox: [x] where x is any non-[, non-] char
// - trailing spaces after checkbox if present
var LIST_PREFIX_RE = /^(\s*[-*+]\s+(\[[^\[\]]\]\s+)?)?/;

// Strip leading bullet / task markers from a list line, keep the content.
// Examples:
//   "- Foo"              -> "Foo"
//   "  - [ ] Bar"        -> "Bar"
//   "  - [o] Baz"        -> "Baz"
//   "* [-] Quux"         -> "Quux"
function stripListPrefix(line) {
  return line.replace(LIST_PREFIX_RE, "");
}

// --- list item helpers ---

function getListItemAtLine(listItems, line) {
  if (!listItems) return null;
  for (var i = 0; i < listItems.length; i++) {
    var li = listItems[i];
    if (!li.position || !li.position.start) continue;
    if (li.position.start.line === line) return li;
  }
  return null;
}

function buildLineToItemMap(listItems) {
  var map = new Map();
  if (!listItems) return map;
  for (var i = 0; i < listItems.length; i++) {
    var li = listItems[i];
    if (!li.position || !li.position.start) continue;
    var line = li.position.start.line;
    if (typeof line === "number") map.set(line, li);
  }
  return map;
}

function isDescendantOf(item, ancestorLine, lineToItem) {
  var parentLine = item.parent;
  while (typeof parentLine === "number" && parentLine >= 0) {
    if (parentLine === ancestorLine) return true;
    var parentItem = lineToItem.get(parentLine);
    if (!parentItem) break;
    parentLine = parentItem.parent;
  }
  return false;
}

function findChildrenBlockFromListItems(editor, listItems, parentLine) {
  if (!listItems || listItems.length === 0) return null;

  var parentItem = getListItemAtLine(listItems, parentLine);
  if (!parentItem) return null;

  var lineToItem = buildLineToItemMap(listItems);
  var childItems = [];

  for (var i = 0; i < listItems.length; i++) {
    var li = listItems[i];
    if (!li.position || !li.position.start || !li.position.end) continue;
    var startLine = li.position.start.line;
    if (typeof startLine !== "number") continue;
    if (startLine <= parentLine) continue;
    if (isDescendantOf(li, parentLine, lineToItem)) childItems.push(li);
  }

  if (childItems.length === 0) return null;

  var minStart = Infinity;
  var maxEnd = -1;
  for (var j = 0; j < childItems.length; j++) {
    var ci = childItems[j];
    var s = ci.position.start.line;
    var e = ci.position.end.line;
    if (s < minStart) minStart = s;
    if (e > maxEnd) maxEnd = e;
  }

  if (!isFinite(minStart) || maxEnd < minStart) return null;

  var endExclusive = Math.min(maxEnd + 1, editor.lineCount());
  var text = editor.getRange(
    { line: minStart, ch: 0 },
    { line: endExclusive, ch: 0 }
  );

  return {
    startLine: minStart,
    endLine: endExclusive,
    lines: text.split("\n")
  };
}

// --- link + clipboard helpers ---

function findFirstWikiLink(lineText, sourcePath, metadataCache) {
  var wikiRegex = /\[\[([^\]]+)\]\]/g;
  var match;

  while ((match = wikiRegex.exec(lineText)) !== null) {
    var index = match.index;
    if (index > 0 && lineText.charAt(index - 1) === "!") continue; // ignore ![[ ]]

    var inner = match[1];
    var parts = inner.split("|");
    var left = parts[0];                  // Note[#Section]
    var linkParts = left.split("#");
    var linkPath = linkParts[0];

    if (!linkPath) continue;

    var tfile = metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
    if (tfile && tfile.extension === "md") {
      return {
        tfile: tfile,
        index: index,
        matchText: match[0],
        wikiInner: inner
      };
    }
  }

  return null;
}

// Is the parent line a "pure link bullet" (only markers + one wikilink)?
function isPureLinkBullet(parentText, firstLink) {
  if (!firstLink) return false;

  // Remove a single list prefix (bullet + optional checkbox) using shared regex
  var stripped = stripListPrefix(parentText).trim();

  // Must be exactly the first wikilink text and nothing else
  if (stripped !== firstLink.matchText) return false;

  // Ensure there is only one wikilink on the line
  var wikiRegex = /\[\[/g;
  var count = 0;
  var m;
  while ((m = wikiRegex.exec(parentText)) !== null) {
    count++;
  }
  return count === 1;
}

// Replace wikilinks in text with their display text so we can safely use it
// inside a #section reference without nested [[ ]].
function stripWikiLinksToDisplayText(text) {
  var wikiRegex = /\[\[([^\]]+)\]\]/g;
  return text.replace(wikiRegex, function (_match, inner) {
    var parts = inner.split("|");
    var left = parts[0];
    var aliasPart = parts.length > 1 ? parts.slice(1).join("|") : null;

    if (aliasPart) {
      return aliasPart.trim();
    }

    // No alias: for [[Note#Section]] display is "Section"; for [[Note]] it's "Note"
    var linkParts = left.split("#");
    if (linkParts.length > 1 && linkParts[1].trim() !== "") {
      return linkParts[1].trim(); // the section name
    } else {
      return linkParts[0].trim(); // the page name
    }
  });
}

async function copyToClipboard(text) {
  try {
    if (typeof navigator !== "undefined" &&
        navigator.clipboard &&
        navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      debug("copied block to clipboard");
    } else {
      debug("clipboard API not available; skipping copy");
    }
  } catch (e) {
    debug("clipboard copy failed: " + (e && e.message ? e.message : String(e)));
  }
}

// --- main ---

async function extractLog(tp) {
  try {
    debug("start");

    var app = getObsidianApp(tp);
    var metadataCache = app.metadataCache;
    var vault = app.vault;

    var leaf = app.workspace.activeLeaf;
    var view = leaf && leaf.view;
    if (!view || view.getViewType() !== "markdown") {
      showNotice("extractLog ERROR: No active markdown view.");
      return;
    }

    var editor = view.editor;
    var file = view.file;
    if (!file) {
      showNotice("extractLog ERROR: No active file.");
      return;
    }

    var sourcePath = file.path;
    var dailyNoteName = file.basename;

    var cursor = editor.getCursor();
    var parentLine = cursor.line;
    var parentText = editor.getLine(parentLine);

    debug("current line " + parentLine + ": " + parentText);

    var fileCache = metadataCache.getFileCache(file);
    var listItems = fileCache && fileCache.listItems;

    if (!listItems || listItems.length === 0) {
      showNotice("extractLog ERROR: No listItems metadata in this file.");
      return;
    }

    var children = findChildrenBlockFromListItems(editor, listItems, parentLine);
    if (!children) {
      showNotice("extractLog: No children under current bullet (no-op).");
      return;
    }

    debug("found children lines: " + children.lines.length);

    var childrenLines = children.lines.slice();
    var dedentedChildrenLines = dedentLines(childrenLines);

    // Copy the dedented block (just the bullets, not the heading) to clipboard
    var clipboardText = dedentedChildrenLines.join("\n");
    if (clipboardText.trim() !== "") {
      await copyToClipboard(clipboardText);
    }

    // Target note & heading suffix logic
    var firstLink = findFirstWikiLink(parentText, sourcePath, metadataCache);
    var targetFile = null;

    // what we append after the [[DailyNote]] in the heading
    var headingSuffix = "";

    if (firstLink) {
      targetFile = firstLink.tfile;

      // CASE 1: current bullet is a pure-link list item
      if (isPureLinkBullet(parentText, firstLink)) {
        // Try to get this list item's parent and use THAT line's content (sans bullet/checkbox) as suffix
        var currentItem = getListItemAtLine(listItems, parentLine);
        if (
          currentItem &&
          typeof currentItem.parent === "number" &&
          currentItem.parent >= 0
        ) {
          var parentListLine = currentItem.parent;
          var parentListText = editor.getLine(parentListLine);
          // Remove "- ", "- [ ] ", "- [o] ", etc. from the parent line
          headingSuffix = stripListPrefix(parentListText).trim();
          debug(
            "target from pure-link bullet, suffix(parent list text): " +
              headingSuffix
          );
        }
      } else {
        // CASE 2: non-pure link → suffix = text after the link (previous behavior)
        var afterLinkRaw = parentText.slice(
          firstLink.index + firstLink.matchText.length
        );
        headingSuffix = afterLinkRaw.trim();
        debug(
          "target from link, suffix(after-link): " +
            (headingSuffix || "(none)")
        );
      }
    } else {
      // CASE 3: no link in current bullet → prompt for target, no suffix
      var allMdFiles = vault.getMarkdownFiles();
      if (!allMdFiles || allMdFiles.length === 0) {
        showNotice("extractLog ERROR: No markdown files in vault.");
        return;
      }
      var display = allMdFiles.map(function (f) {
        return f.path;
      });
      targetFile = await tp.system.suggester(display, allMdFiles);
      if (!targetFile) {
        showNotice("extractLog: No target note selected (cancelled).");
        return;
      }
      headingSuffix = "";
      debug("target from picker: " + targetFile.path);
    }

    // Cut children from source note
    editor.replaceRange(
      "",
      { line: children.startLine, ch: 0 },
      { line: children.endLine, ch: 0 }
    );
    debug("removed children block in source note");

    // Build the heading line (can contain wikilinks etc.)
    var rawHeadingLineSuffix = headingSuffix ? " " + headingSuffix : "";
    var headingLine = "### [[" + dailyNoteName + "]]" + rawHeadingLineSuffix;

    // For the section anchor (#...), we must NOT keep [[...]] in place,
    // otherwise we get nested brackets. Convert wikilinks to display text.
    var rawHeadingTextForLink = dailyNoteName + rawHeadingLineSuffix;
    var headingTextForLink = stripWikiLinksToDisplayText(rawHeadingTextForLink).trim();


    // Update wikilink in parent bullet to point to this heading,
    // but keep the visible text exactly as before by using an alias.
    if (firstLink) {
      var inner = firstLink.wikiInner;
      var p = inner.split("|");
      var left = p[0];                                 // original link target (page[#section])
      var aliasPart = p.length > 1 ? p.slice(1).join("|") : null;

      // Base page name (drop any old section)
      var lp = left.split("#");
      var page = lp[0];

      // New target with updated section
      var newLeft = page + "#" + headingTextForLink;

      // Visible text should stay exactly the same as before:
      // - if there was an alias, use that
      // - otherwise use the original left part as-is
      var displayTextOriginal = aliasPart ? aliasPart : left;

      var newInner = newLeft + "|" + displayTextOriginal;
      var newLink = "[[" + newInner + "]]";

      var updatedParentText =
        parentText.slice(0, firstLink.index) +
        newLink +
        parentText.slice(firstLink.index + firstLink.matchText.length);

      editor.setLine(parentLine, updatedParentText);
      debug("updated wikilink in parent bullet");
    } else {
      debug("no wikilink in parent bullet to update");
    }

    // Find ## Log in target via metadataCache
    var targetCache = metadataCache.getFileCache(targetFile);
    var logHeadingLine = null;

    if (targetCache && targetCache.headings) {
      for (var h = 0; h < targetCache.headings.length; h++) {
        var heading = targetCache.headings[h];
        if (heading.level === 2 && heading.heading === "Log") {
          logHeadingLine = heading.position.start.line;
          break;
        }
      }
    }

    if (logHeadingLine !== null) {
      debug("found ## Log at line " + logHeadingLine + " in target");
    } else {
      debug("no ## Log found in target; will create one");
    }

    // Build block that goes into ## Log
    var blockLines = ["", headingLine, ""].concat(dedentedChildrenLines);

    await vault.process(targetFile, function (data) {
      var lines = data.split("\n");

      if (logHeadingLine !== null && logHeadingLine < lines.length) {
        var insertAt = logHeadingLine + 1;
        lines.splice.apply(lines, [insertAt, 0].concat(blockLines));
        return lines.join("\n");
      } else {
        var newLines = lines.slice();
        if (
          newLines.length > 0 &&
          newLines[newLines.length - 1].trim() !== ""
        ) {
          newLines.push("");
        }
        newLines.push("## Log");
        Array.prototype.push.apply(newLines, blockLines);
        return newLines.join("\n");
      }
    });

    showNotice(
      'extractLog: moved child block to "' +
        targetFile.basename +
        '" > Log',
      4000
    );
    debug("finished OK");
  } catch (e) {
    showNotice(
      "extractLog ERROR: " +
        (e && e.message ? e.message : String(e)),
      8000
    );
    console.log("extractLog ERROR", e);
  }
}

// Export main function and helpers
module.exports = {
  extractLog,
  countIndent,
  dedentLines,
  stripListPrefix,
  stripWikiLinksToDisplayText,
  buildLineToItemMap,
  isPureLinkBullet
};
