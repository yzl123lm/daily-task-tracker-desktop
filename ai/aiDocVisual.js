(function (global) {
  function docVisualFromExtName(extRaw, nameRaw = "") {
    const ext =
      String(extRaw || "").trim().toLowerCase() ||
      (() => {
        const n = String(nameRaw || "").trim();
        const i = n.lastIndexOf(".");
        return i >= 0 ? n.slice(i).toLowerCase() : "";
      })();
    if (ext === ".doc" || ext === ".docx") return { badge: "WORD", kind: "word" };
    if (ext === ".pdf") return { badge: "PDF", kind: "pdf" };
    if (ext === ".xls" || ext === ".xlsx" || ext === ".csv") return { badge: "XLS", kind: "sheet" };
    if (ext === ".txt" || ext === ".md" || ext === ".markdown" || ext === ".log" || ext === ".rtf") {
      return { badge: "TXT", kind: "text" };
    }
    if (ext === ".json" || ext === ".xml" || ext === ".html" || ext === ".htm" || ext === ".yml" || ext === ".yaml") {
      return { badge: "DATA", kind: "data" };
    }
    return { badge: "FILE", kind: "file" };
  }

  global.docVisualFromExtName = docVisualFromExtName;
})(typeof window !== "undefined" ? window : global);
