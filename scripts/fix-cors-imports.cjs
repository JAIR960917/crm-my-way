const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "supabase", "functions");
const CORS_IMPORT = 'import { corsHeadersFor } from "../_shared/cors.ts";';

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== "_shared") walk(p, acc);
    else if (ent.name === "index.ts") acc.push(p);
  }
  return acc;
}

for (const file of walk(root)) {
  let c = fs.readFileSync(file, "utf8");
  if (!c.includes("corsHeadersFor(req)")) continue;
  let changed = false;

  const dup =
    /const corsHeaders = corsHeadersFor\(req\);\r?\n\s*const corsHeaders = corsHeadersFor\(req\);/g;
  while (dup.test(c)) {
    c = c.replace(dup, "const corsHeaders = corsHeadersFor(req);");
    changed = true;
  }

  if (!c.includes(CORS_IMPORT)) {
    const eol = c.includes("\r\n") ? "\r\n" : "\n";
    if (/^import /m.test(c)) {
      c = c.replace(/^(import .+\r?\n)/m, `$1${CORS_IMPORT}${eol}`);
    } else {
      c = `${CORS_IMPORT}${eol}${c}`;
    }
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, c);
    console.log("fixed", path.relative(root, file));
  }
}
