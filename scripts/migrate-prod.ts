import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { CONTAINER, IMAGE, quote, ssh } from "./production";

const { values } = parseArgs({ options: { image: { type: "string", default: IMAGE } } });
const image = values.image!;
if (!/^ghcr\.io\/siliconharbour\/siliconharbour\.dev(?::[\w.-]+|@sha256:[a-f0-9]{64})$/.test(image))
  throw new Error("Choose a Silicon Harbour image tag or immutable digest");
ssh(`docker pull ${quote(image)}`, { stdio: "inherit" });
const [id, revision] = ssh(
  `docker image inspect ${quote(image)} --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}'`,
)
  .trim()
  .split(/\s+/);
const selected = { id, revision };
if (!/^sha256:[a-f0-9]{64}$/.test(selected.id) || !/^[a-f0-9]{40}$/.test(selected.revision))
  throw new Error("Image identity or revision is unavailable");
console.log(`Production migration image: ${selected.id}`);
console.log(`Revision: ${selected.revision}`);
console.log("The site stays running. Pending SQL must be compatible with its current code.");
console.log(
  "A verified SQLite backup will be retained in the production data volume before applying changes.",
);
const prompt = createInterface({ input: process.stdin, output: process.stdout });
let answer: string;
try {
  answer = await prompt.question("Apply these production migrations? Type 'yes': ");
} finally {
  prompt.close();
}
if (answer.trim().toLowerCase() !== "yes") {
  console.log("Aborted.");
} else {
  ssh(
    `docker run --rm --network none --volumes-from ${CONTAINER} -e DB_URL=/app/data/siliconharbour.db ${quote(selected.id)} node --import tsx scripts/migrate.ts --existing --backup-dir /app/data/backups`,
    { stdio: "inherit" },
  );
  console.log(
    "Production migrations completed. The application container was not stopped or replaced.",
  );
}
