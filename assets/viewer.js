/* site/viewer.html, the framed PDF reader.
   ---------------------------------------------------------------------------
   WHAT IT IS FOR. A record whose source URL is a direct `.pdf` hands the reader a
   file rather than a page, and whether that opens in the browser's PDF viewer or
   starts a download is the publisher's Content-Disposition header first and the
   reader's own browser setting second. The page controls neither. Framing the PDF
   routes around both: the browser renders it in its built-in viewer, with that
   viewer's own download and print controls, inside a page that says which record
   it is and links to the publisher.

   WHAT IT IS NOT. The document is fetched from the PUBLISHER'S server by the
   reader's browser. Nothing is copied here, no byte of it passes through a Lab
   host, and the publisher's own logs see the request. That is the line between
   this and a mirror under site/mirrors.yaml, which DOES rehost a document and so
   needs a written licence per record. Do not let this page drift into the other
   thing: if a document ever needs to be served from a Lab host, it goes through
   mirrors.yaml and its licence gate.

   WHY IT REFUSES SOME RECORDS. Framing is the publisher's call. A host sending
   `X-Frame-Options` or a restricting `frame-ancestors` renders an EMPTY frame,
   verified in a browser on 2026-09-16 against NNN 105. Handing a reader a blank
   page is the failure this site is built to avoid, so eligibility is measured by
   scripts/check_pdf_embedding.py and read from data/pdf_embed.json. An
   `embeddable` of null is unconfirmed and is refused exactly like false: a check
   that could not settle something is never resolved by inference. */

(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function fmtDate(iso) {
    if (!iso) return null;
    var p = String(iso).split("-");
    var m = ["January","February","March","April","May","June",
             "July","August","September","October","November","December"];
    if (p.length >= 3) return m[+p[1] - 1] + " " + (+p[2]) + ", " + p[0];
    if (p.length === 2) return m[+p[1] - 1] + " " + p[0];
    return p[0];
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return null; }
  }

  function fallback(title, body, linkLabel, linkHref) {
    $("v-frame").hidden = true;
    $("v-note").hidden = true;
    $("v-fallback").hidden = false;
    $("v-fallback-title").textContent = title;
    $("v-fallback-body").textContent = body;
    if (linkHref) {
      var a = $("v-fallback-link");
      a.hidden = false;
      a.href = linkHref;
      a.textContent = linkLabel;
    }
  }

  var nnn = new URLSearchParams(location.search).get("nnn");
  var ui = new URLSearchParams(location.search).get("ui");
  if (ui === "dark") document.documentElement.setAttribute("data-ui", "dark");
  $("back").href = "index.html" + (nnn ? "?open=" + encodeURIComponent(nnn) : "")
                 + (ui === "dark" ? (nnn ? "&" : "?") + "ui=dark" : "");

  /* Revalidated, not cached blind. The reader page learned this on 2026-09-17:
     without it a stale payload survives an export and even a hard reload. */
  var opts = { cache: "no-cache" };
  Promise.all([
    fetch("data/repository.json", opts).then(function (r) {
      if (!r.ok) throw new Error("repository.json returned " + r.status);
      return r.json();
    }),
    fetch("data/pdf_embed.json", opts).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
  ]).then(function (both) {
    var data = both[0], embed = both[1];

    if (!nnn) {
      document.title = "Reader · Resilience Finance Repository";
      $("v-title").textContent = "No record named";
      return fallback("No record named",
        "This reader opens one record at a time and the address carries no record number. "
        + "Pick a record in the repository and use its Read in browser button.",
        "Back to the repository", "index.html");
    }

    var rec = null;
    for (var i = 0; i < data.records.length; i++) {
      if (String(data.records[i].nnn) === String(nnn)) { rec = data.records[i]; break; }
    }
    if (!rec) {
      $("v-title").textContent = "Record " + nnn + " is not in this payload";
      return fallback("Record " + nnn + " is not in this payload",
        "The site shows a snapshot of the canonical database. A record promoted after the "
        + "export ran is not here until the export runs again, and a record removed from the "
        + "database leaves on the same schedule.",
        "Back to the repository", "index.html");
    }

    document.title = rec.title + " · Resilience Finance Repository";
    $("v-title").textContent = rec.title;
    var bits = [];
    if (rec.authors) bits.push(rec.authors);
    var d = fmtDate(rec.date) || (rec.year ? String(rec.year) : null);
    if (d) bits.push(d);
    if (rec.resource_type) bits.push(rec.resource_type);
    $("v-byline").textContent = bits.join("  ·  ");

    if (rec.url) {
      var src = $("v-source");
      src.hidden = false;
      src.href = rec.url;
      var h = hostOf(rec.url);
      src.textContent = h ? "Open at " + h : "Open at the publisher";
    }

    /* A mirror frames the LAB'S copy; everything else frames the publisher's. */
    var isMirror = rec.access === "mirror" && rec.mirror_url;
    var docUrl = isMirror ? rec.mirror_url : rec.url;

    if (!docUrl) {
      return fallback("No link is recorded for this record",
        "This record carries no public URL, so there is nothing for the reader to open. A copy "
        + (rec.has_attachment ? "is held with the record, but behind a signed link that "
           + "expires within the hour, which is why no button to it can be published. "
           : "is not held with the record either. ")
        + "The fix is a source URL on the record, or a Lab-hosted copy declared in "
        + "site/mirrors.yaml with its licence beside it.",
        "Back to the repository", "index.html");
    }

    var entry = embed && embed.records ? embed.records[String(rec.nnn)] : null;
    var ok = entry && entry.embeddable === true;

    if (!ok) {
      /* Refused and unconfirmed land here together and are described separately,
         because "the publisher does not allow it" and "we could not tell" are
         different facts and a reader deciding what to do next needs the right one. */
      var why = entry && entry.reason ? entry.reason : "this record carries no measured result";
      var unconfirmed = !entry || entry.embeddable === null;
      return fallback(
        unconfirmed ? "This one could not be checked" : "This publisher does not allow embedding",
        (unconfirmed
          ? "We could not confirm whether this document can be displayed here, and showing it "
            + "unchecked would risk an empty page. The reason recorded was: " + why + ". "
          : "The publisher's server refuses to be displayed inside another page, so it would "
            + "render blank here. The reason recorded was: " + why + ". ")
        + "Their own copy opens normally in a new tab.",
        rec.url ? "Open at " + (hostOf(rec.url) || "the publisher") : null, rec.url);
    }

    var frame = $("v-frame");
    frame.hidden = false;
    frame.src = docUrl;
    frame.title = rec.title;

    /* The footer says who is actually serving the bytes, and the two cases are different
       facts. Saying the Lab does not host a document that the Lab IS hosting would be a
       false statement about rights, which is the one thing this footer exists to get right. */
    var note = $("v-note");
    note.hidden = false;
    note.textContent = isMirror
      ? "Hosted by the Resilience Finance Lab at " + (hostOf(docUrl) || "a Lab host")
        + (rec.mirror_licence ? ", under this permission: " + rec.mirror_licence : "")
        + ". Displayed by your browser's PDF viewer, which carries its own download and print buttons."
      : "Served by " + (hostOf(docUrl) || "the publisher")
        + " and displayed by your browser's PDF viewer, which carries its own download and "
        + "print buttons. The Resilience Finance Lab does not host this document.";
  }).catch(function (e) {
    $("v-title").textContent = "The repository data could not be loaded";
    fallback("The repository data could not be loaded",
      "This page fetches data/repository.json over HTTP, so it has to be served rather than "
      + "opened from the file system. The error was: " + e.message,
      "Back to the repository", "index.html");
  });

})();
