/** Applies migrations and creates the first admin (the app also does this on start). */
import "dotenv/config";
import { bootstrap } from "@/lib/bootstrap";

bootstrap()
  .then(() => {
    console.log("Database is up to date.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
