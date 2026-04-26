const SOURCIFY_BASE = "https://sourcify.dev/server";

interface SourcifyFile {
  name:    string;
  path:    string;
  content: string;
}

interface SourcifyFilesResponse {
  status: string;
  files:  SourcifyFile[];
}

export interface SourceFiles {
  [path: string]: string;
}

export async function fetchSourceFromSourcify(
  chainId: number,
  address: string
): Promise<SourceFiles | null> {
  // Try full match first, then partial match
  for (const matchType of ["full_match", "partial_match"]) {
    const url = `${SOURCIFY_BASE}/files/${matchType}/${chainId}/${address}/`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data: SourcifyFilesResponse = await res.json() as SourcifyFilesResponse;
      if (!data.files?.length) continue;

      const result: SourceFiles = {};
      for (const f of data.files) {
        // Strip the leading chain/address prefix from the path to get clean import paths
        const cleanPath = f.path
          .replace(/^.*?\/sources\//, "")
          .replace(/^sources\//, "");
        result[cleanPath || f.name] = f.content;
      }
      return result;
    } catch {
      continue;
    }
  }

  // Try the flat files endpoint as last resort
  try {
    const url = `${SOURCIFY_BASE}/files/any/${chainId}/${address}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: SourcifyFilesResponse = await res.json() as SourcifyFilesResponse;
    if (!data.files?.length) return null;

    const result: SourceFiles = {};
    for (const f of data.files) {
      result[f.name] = f.content;
    }
    return result;
  } catch {
    return null;
  }
}

export async function fetchABIFromSourcify(
  chainId: number,
  address: string
): Promise<object[] | null> {
  const url = `${SOURCIFY_BASE}/files/any/${chainId}/${address}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: SourcifyFilesResponse = await res.json() as SourcifyFilesResponse;
    const metaFile = data.files?.find(f => f.name === "metadata.json");
    if (!metaFile) return null;
    const meta = JSON.parse(metaFile.content) as { output?: { abi?: object[] } };
    return meta.output?.abi ?? null;
  } catch {
    return null;
  }
}
