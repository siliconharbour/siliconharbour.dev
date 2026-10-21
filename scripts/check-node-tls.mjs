import https from "node:https";

const rejected = new Set([
  "CERT_REVOKED", "CERT_SIGNATURE_FAILURE", "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_UNTRUSTED", "SELF_SIGNED_CERT_IN_CHAIN",
]);
function request(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("timeout", () => req.destroy(new Error("TLS probe timed out")));
    req.on("error", reject);
  });
}
await request("https://example.com/");
console.log("PASS trusted HTTPS", process.version);
for (const host of ["dv-g3b-emudhra", "dv-g3b-aaa-emudhra"]) {
  const url = `https://${host}.we-have-a-problem.com/`;
  let failure;
  try { await request(url); } catch (error) { failure = error; }
  if (!failure || !rejected.has(failure.code)) {
    throw new Error(`Expected certificate rejection for ${url}`, { cause: failure });
  }
  console.log("PASS rejected", url, failure.code);
}
