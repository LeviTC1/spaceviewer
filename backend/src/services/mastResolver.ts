import axios from "axios";

const MAST_INVOKE_URL = "https://mast.stsci.edu/api/v0/invoke";
const MAST_TIMEOUT_MS = 10000;

export interface ResolvedTarget {
  ra: number;
  dec: number;
  name: string;
  radius?: number;
  resolver?: string;
}

interface MastNameLookupResponse {
  resolvedCoordinate?: Array<{
    ra?: number;
    decl?: number;
    canonicalName?: string;
    radius?: number;
    resolver?: string;
  }>;
  status?: string;
}

export const getMastResolverDiagnostics = () => ({
  endpoint: MAST_INVOKE_URL,
  service: "Mast.Name.Lookup",
  timeoutMs: MAST_TIMEOUT_MS,
});

export const resolveTarget = async (input: string): Promise<ResolvedTarget | null> => {
  const requestPayload = {
    service: "Mast.Name.Lookup",
    params: {
      input,
      format: "json",
    },
  };

  const formBody = new URLSearchParams();
  formBody.set("request", JSON.stringify(requestPayload));

  try {
    const response = await axios.post(MAST_INVOKE_URL, formBody.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/plain",
      },
      timeout: MAST_TIMEOUT_MS,
    });

    const data: MastNameLookupResponse =
      typeof response.data === "string" ? JSON.parse(response.data) : (response.data as MastNameLookupResponse);
    const candidate = data?.resolvedCoordinate?.[0];

    if (!candidate || typeof candidate.ra !== "number" || typeof candidate.decl !== "number") {
      return null;
    }

    return {
      ra: candidate.ra,
      dec: candidate.decl,
      name: candidate.canonicalName ?? input,
      radius: typeof candidate.radius === "number" ? candidate.radius : undefined,
      resolver: candidate.resolver,
    };
  } catch (error) {
    console.error("resolveTarget error", error);
    throw error;
  }
};
