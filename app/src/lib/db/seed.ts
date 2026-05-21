async function seed() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  // Phoenix Vault no longer seeds demo pools — the pool registry is populated
  // by real on-chain launches via /create. This script remains as a hook for
  // future migrations / fixture loading.
  console.log("Nothing to seed. Launch real pools from /create to populate.");
}

seed().catch(console.error);
