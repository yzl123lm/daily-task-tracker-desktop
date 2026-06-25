const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const asar =
  process.argv[2] ||
  (process.env.LOCALAPPDATA
    ? path.join(
        process.env.LOCALAPPDATA,
        "Programs/daily-task-tracker-desktop/resources/app.asar"
      )
    : "");

if (!fs.existsSync(asar)) {
  console.log("installed asar missing");
  process.exit(0);
}

const out = execSync(
  `npx --yes asar extract-file "${asar.replace(/\\/g, "/")}" knowledgeBaseMain.js -`,
  {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    cwd: path.join(__dirname, ".."),
  }
);
console.log("closeAllLibraryDbs:", out.includes("closeAllLibraryDbs"));
console.log(
  "meta before rm:",
  out.includes("saveKbMeta(ud(), meta)") &&
    out.indexOf("saveKbMeta(ud(), meta)") < out.indexOf("fs.rmSync")
);
console.log("resolvePinnedKbRoot:", out.includes("resolvePinnedKbRoot"));
