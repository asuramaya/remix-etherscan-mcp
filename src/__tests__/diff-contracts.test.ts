import { describe, it, expect } from "vitest";

// Test the rename-detection logic from diff_contracts in composite.ts.
// We extract and replicate it here so it can be tested without a full server.

interface RenameResult {
  renamedFiles:    Array<{ from: string; to: string }>;
  filesOnlyInA:   string[];
  filesOnlyInB:   string[];
}

function detectRenames(
  rawOnlyInA:  string[],
  rawOnlyInB:  string[],
  filesA:      Record<string, string>,
  filesB:      Record<string, string>,
): RenameResult {
  const renamedFiles: Array<{ from: string; to: string }> = [];
  const filesOnlyInA: string[] = [];
  const filesOnlyInB: string[] = [];

  const bOnlyByContent = new Map<string, string>();
  for (const f of rawOnlyInB) bOnlyByContent.set(filesB[f]!, f);

  for (const f of rawOnlyInA) {
    const bMatch = bOnlyByContent.get(filesA[f]!);
    if (bMatch !== undefined) {
      renamedFiles.push({ from: f, to: bMatch });
      bOnlyByContent.delete(filesA[f]!);
    } else {
      filesOnlyInA.push(f);
    }
  }
  filesOnlyInB.push(...bOnlyByContent.values());

  return { renamedFiles, filesOnlyInA, filesOnlyInB };
}

describe("diff_contracts — rename detection", () => {
  it("detects a pure rename (identical content, different name)", () => {
    const content = "contract Token {}";
    const result = detectRenames(
      ["Token.sol"],
      ["ERC20Token.sol"],
      { "Token.sol": content },
      { "ERC20Token.sol": content },
    );
    expect(result.renamedFiles).toEqual([{ from: "Token.sol", to: "ERC20Token.sol" }]);
    expect(result.filesOnlyInA).toHaveLength(0);
    expect(result.filesOnlyInB).toHaveLength(0);
  });

  it("treats differing content as add+delete, not rename", () => {
    const result = detectRenames(
      ["Old.sol"],
      ["New.sol"],
      { "Old.sol": "contract Old {}" },
      { "New.sol": "contract New {}" },
    );
    expect(result.renamedFiles).toHaveLength(0);
    expect(result.filesOnlyInA).toEqual(["Old.sol"]);
    expect(result.filesOnlyInB).toEqual(["New.sol"]);
  });

  it("handles mixed: one rename + one genuine add/delete", () => {
    const shared = "// shared content";
    const result = detectRenames(
      ["SharedOld.sol", "Removed.sol"],
      ["SharedNew.sol", "Added.sol"],
      { "SharedOld.sol": shared, "Removed.sol": "old content" },
      { "SharedNew.sol": shared, "Added.sol": "new content" },
    );
    expect(result.renamedFiles).toEqual([{ from: "SharedOld.sol", to: "SharedNew.sol" }]);
    expect(result.filesOnlyInA).toEqual(["Removed.sol"]);
    expect(result.filesOnlyInB).toEqual(["Added.sol"]);
  });

  it("does not match two renames to the same target", () => {
    const content = "// same";
    // Both A files have same content as the one B file — only first match wins
    const result = detectRenames(
      ["A1.sol", "A2.sol"],
      ["B1.sol"],
      { "A1.sol": content, "A2.sol": content },
      { "B1.sol": content },
    );
    expect(result.renamedFiles).toHaveLength(1);
    // One file remains as only-in-A
    expect(result.filesOnlyInA).toHaveLength(1);
  });

  it("handles no renames when lists are empty", () => {
    const result = detectRenames([], [], {}, {});
    expect(result.renamedFiles).toHaveLength(0);
    expect(result.filesOnlyInA).toHaveLength(0);
    expect(result.filesOnlyInB).toHaveLength(0);
  });

  it("handles multiple renames", () => {
    const contentA = "contract A {}";
    const contentB = "contract B {}";
    const result = detectRenames(
      ["OldA.sol", "OldB.sol"],
      ["NewA.sol", "NewB.sol"],
      { "OldA.sol": contentA, "OldB.sol": contentB },
      { "NewA.sol": contentA, "NewB.sol": contentB },
    );
    expect(result.renamedFiles).toHaveLength(2);
    expect(result.filesOnlyInA).toHaveLength(0);
    expect(result.filesOnlyInB).toHaveLength(0);
  });
});
