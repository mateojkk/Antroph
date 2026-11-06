// Test a Supabase secret key against REST from Node fetch.
const url = "https://fmcimfaztybpznllqraw.supabase.co";
const key = process.argv[2];
if (!key) { console.error("usage: node test-secret.mjs <sb_secret_key>"); process.exit(1); }

console.log("key length after prefix:", key.length - "sb_secret_".length);
const combos = [
  ["apikey-only", { apikey: key }],
  ["auth-only", { authorization: `Bearer ${key}` }],
  ["both", { apikey: key, authorization: `Bearer ${key}` }],
];
for (const [label, headers] of combos) {
  try {
    const res = await fetch(`${url}/rest/v1/users?select=id&limit=1`, { headers });
    const body = await res.text();
    console.log(`${label}: HTTP ${res.status} body=${body.slice(0, 200)}`);
  } catch (e) {
    console.log(`${label}: FAILED ${e.cause?.code || e.message}`);
  }
}
