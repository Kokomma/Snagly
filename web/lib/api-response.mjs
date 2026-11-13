export async function apiResponse(response) {
  try {
    const value = JSON.parse(await response.text());
    if (!value || typeof value !== "object") throw new Error("Invalid response");
    return value;
  } catch {
    throw new Error("Snagly’s server could not complete that request. Please try again shortly. If you were signing in, your password may still be correct.");
  }
}
