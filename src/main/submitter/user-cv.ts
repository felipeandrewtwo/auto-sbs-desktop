export async function getUserCv(token: string, apiUrl: string): Promise<string> {
  if (!token?.trim()) throw new Error("SESSION_EXPIRED");
  let base: URL;
  try {
    base = new URL(apiUrl);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) {
      throw new Error("INVALID_API_URL");
    }
  } catch {
    throw new Error("INVALID_API_URL");
  }
  let response: Response;
  try {
    response = await fetch(`${base.href.replace(/\/+$/, "")}/users/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error",
    });
  } catch {
    throw new Error("CV_NETWORK_ERROR");
  }
  if (response.status === 401) throw new Error("SESSION_EXPIRED");
  if (response.status === 404) throw new Error("PROFILE_UNAVAILABLE");
  if (response.status === 403) throw new Error("PROFILE_FORBIDDEN");
  if (!response.ok) throw new Error(`CV_HTTP_ERROR_${response.status}`);
  let profile: unknown;
  try {
    profile = await response.json();
  } catch {
    throw new Error("PROFILE_INVALID_RESPONSE");
  }
  if (!profile || typeof profile !== "object" || !("cvContent" in profile)) {
    throw new Error("PROFILE_INVALID_RESPONSE");
  }
  const cv = profile.cvContent;
  if (typeof cv !== "string" || !cv.trim()) throw new Error("CV_EMPTY");
  return cv;
}

export async function getCurrentUserCv(readToken: () => string | null, apiUrl: string): Promise<string> {
  const token = readToken();
  if (!token) throw new Error("SESSION_EXPIRED");
  const cv = await getUserCv(token, apiUrl);
  if (readToken() !== token) throw new Error("SESSION_CHANGED");
  return cv;
}
