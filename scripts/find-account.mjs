// Try several Sui GraphQL endpoints to scan account-module events for a delegate pubkey.
const PKG = "0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5";
const pubkey = process.argv[2];

const ENDPOINTS = [
  "https://sui-mainnet.mystenlabs.com/graphql",
  "https://sui-mainnet.public.blastapi.io/graphql",
  "https://graphql.suisuivision.io/graphql",
  "https://sui-mainnet.stakewith.us/graphql",
];

const QUERY = `
query ($c: String) {
  events(first: 50, after: $c,
    filter: { module: { package: "${PKG}", name: "account" } })
  {
    nodes { eventType json }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function tryEndpoint(url) {
  try {
    const probe = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "query { chainIdentifier }" }),
      signal: AbortSignal.timeout(12000),
    });
    console.log(`[probe] ${url} -> ${probe.status} ${(await probe.text()).slice(0, 80)}`);
    if (!probe.ok) return null;
    return url;
  } catch (e) {
    console.log(`[probe] ${url} -> ${e.cause?.code || e.cause?.message || e.message}`);
    return null;
  }
}

const live = [];
for (const url of ENDPOINTS) {
  const ok = await tryEndpoint(url);
  if (ok) live.push(ok);
}
if (!live.length) {
  console.log({ found: null, error: "no reachable graphql endpoint" });
  process.exit(0);
}

for (const url of live) {
  let cursor = null;
  let scanned = 0;
  for (let page = 0; page < 80; page++) {
    const data = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { c: cursor } }),
      signal: AbortSignal.timeout(20000),
    }).then((r) => r.json());
    if (data.errors) throw new Error(JSON.stringify(data.errors));
    const nodes = (data.data.events && data.data.events.nodes) || [];
    scanned += nodes.length;
    if (!nodes.length) break;
    for (const n of nodes) {
      if (JSON.stringify(n.json || "").includes(pubkey)) {
        console.log(JSON.stringify({ endpoint: url, event: n, scanned }, null, 2));
        process.exit(0);
      }
    }
    cursor = data.data.events.pageInfo.endCursor;
    if (!data.data.events.pageInfo.hasNextPage) break;
  }
  console.log(`[scan] ${url}: scanned ${scanned} events, delegate not found`);
}
console.log(JSON.stringify({ found: null }));
