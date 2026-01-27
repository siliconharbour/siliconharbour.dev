import { db } from "../app/db";
import { users } from "../app/db/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

async function createUser() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: npm run create-user <email> <password> [role]");
    console.error("  role: 'regular' (default) or 'admin'");
    process.exit(1);
  }

  const [email, password, role = "regular"] = args;

  if (role !== "regular" && role !== "admin") {
    console.error("Error: role must be 'regular' or 'admin'");
    process.exit(1);
  }

  // Check if user already exists
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    console.error(`Error: User with email '${email}' already exists`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      role,
    })
    .returning();

  console.log(`User created successfully:`);
  console.log(`  ID: ${user.id}`);
  console.log(`  Email: ${user.email}`);
  console.log(`  Role: ${user.role}`);
}

createUser().catch((err) => {
  console.error("Error creating user:", err);
  process.exit(1);
});
