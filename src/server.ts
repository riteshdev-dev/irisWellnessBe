import "dotenv/config";
import app from "./app.js";
import { assertEnv, env } from "./config/env.js";

assertEnv();

const port = env().port;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
