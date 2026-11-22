// examples/basic/server.js
// 1. Dot access
const port = process.env.PORT || 3000;

// 2. Bracket notation
const db = process.env["DATABASE_URL"];

// 3. Destructuring access with missing variable
const { API_KEY, REDIS_URL } = process.env;

// process.env.LEGACY_FLAG is declared in .env but never used here.
// REDIS_URL is used here but missing from .env and .env.example.
// PORT is duplicated in .env.

console.log({ port, db, hasKey: Boolean(API_KEY), redis: REDIS_URL });
