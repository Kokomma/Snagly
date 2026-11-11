export const databaseQuotaMessage = "Snagly’s free database allowance is used up for today. Your sign-in can succeed, but your workspace cannot load until the allowance resets. Please try again later; your saved data has not been deleted.";
export function databaseError(e) {
  if (e.code === 8 || /quota|resource.exhausted/i.test(e.message || "")) {
    const error = new Error(databaseQuotaMessage); error.status = 503; error.code = "database_quota"; return error;
  }
  return e;
}
export const firestoreClientConfig = { interfaces: { "google.firestore.v1.Firestore": {
  methods: Object.fromEntries(["GetDocument","ListDocuments","UpdateDocument","DeleteDocument","BatchGetDocuments","BeginTransaction","Commit","Rollback","RunQuery","RunAggregationQuery","ListCollectionIds"].map(name => [name, { retry_codes_name: "non_idempotent", timeout_millis: 12000 }])),
} } };
