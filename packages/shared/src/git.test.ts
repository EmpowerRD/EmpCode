import type { GitStatusRemoteResult, GitStatusResult } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  applyGitStatusStreamEvent,
  buildJiraCreateTicketUrl,
  buildJiraTicketUrl,
  buildSemanticWorktreeBranchName,
  buildTemporaryWorktreeBranchName,
  DEFAULT_WORKTREE_BRANCH_PREFIX,
  deriveWorktreeBranchSuffix,
  isMainOrMasterBranchName,
  isTemporaryWorktreeBranch,
  isTemporaryWorktreeBranchForPrefix,
  normalizeJiraDomain,
  normalizeJiraProjectKey,
  normalizeWorktreeBranchPrefix,
  normalizeGitRemoteUrl,
  parseGitHubRepositoryNameWithOwnerFromRemoteUrl,
  validateJiraKeyInput,
  WORKTREE_BRANCH_PREFIX,
} from "./git.ts";

describe("normalizeGitRemoteUrl", () => {
  it("canonicalizes equivalent GitHub remotes across protocol variants", () => {
    expect(normalizeGitRemoteUrl("git@github.com:T3Tools/T3Code.git")).toBe(
      "github.com/t3tools/t3code",
    );
    expect(normalizeGitRemoteUrl("https://github.com/T3Tools/T3Code.git")).toBe(
      "github.com/t3tools/t3code",
    );
    expect(normalizeGitRemoteUrl("ssh://git@github.com/T3Tools/T3Code")).toBe(
      "github.com/t3tools/t3code",
    );
  });

  it("preserves nested group paths for providers like GitLab", () => {
    expect(normalizeGitRemoteUrl("git@gitlab.com:T3Tools/platform/T3Code.git")).toBe(
      "gitlab.com/t3tools/platform/t3code",
    );
    expect(normalizeGitRemoteUrl("https://gitlab.com/T3Tools/platform/T3Code.git")).toBe(
      "gitlab.com/t3tools/platform/t3code",
    );
  });

  it("drops explicit ports from URL-shaped remotes", () => {
    expect(normalizeGitRemoteUrl("https://gitlab.company.com:8443/team/project.git")).toBe(
      "gitlab.company.com/team/project",
    );
    expect(normalizeGitRemoteUrl("ssh://git@gitlab.company.com:2222/team/project.git")).toBe(
      "gitlab.company.com/team/project",
    );
  });
});

describe("parseGitHubRepositoryNameWithOwnerFromRemoteUrl", () => {
  it("extracts the owner and repository from common GitHub remote shapes", () => {
    expect(
      parseGitHubRepositoryNameWithOwnerFromRemoteUrl("git@github.com:T3Tools/T3Code.git"),
    ).toBe("T3Tools/T3Code");
    expect(
      parseGitHubRepositoryNameWithOwnerFromRemoteUrl("https://github.com/T3Tools/T3Code.git"),
    ).toBe("T3Tools/T3Code");
  });
});

describe("isTemporaryWorktreeBranch", () => {
  it("matches the generated temporary worktree branch format", () => {
    expect(isTemporaryWorktreeBranch(buildTemporaryWorktreeBranchName())).toBe(true);
  });

  it("matches generated temporary worktree branches", () => {
    expect(isTemporaryWorktreeBranch(`${WORKTREE_BRANCH_PREFIX}/deadbeef`)).toBe(true);
    expect(isTemporaryWorktreeBranch(` ${WORKTREE_BRANCH_PREFIX}/deadbeef `)).toBe(true);
    expect(isTemporaryWorktreeBranch(`${WORKTREE_BRANCH_PREFIX}/DEADBEEF`)).toBe(true);
  });

  it("rejects non-temporary branch names", () => {
    expect(isTemporaryWorktreeBranch(`${WORKTREE_BRANCH_PREFIX}/feature/demo`)).toBe(false);
    expect(isTemporaryWorktreeBranch("main")).toBe(false);
    expect(isTemporaryWorktreeBranch(`${WORKTREE_BRANCH_PREFIX}/deadbeef-extra`)).toBe(false);
  });
});

describe("worktree branch helpers", () => {
  it("uses empcode as the default worktree branch prefix", () => {
    expect(DEFAULT_WORKTREE_BRANCH_PREFIX).toBe("empcode");
    expect(normalizeWorktreeBranchPrefix(" EmpCode ")).toBe("empcode");
  });

  it("preserves jira-style prefixes in uppercase", () => {
    expect(normalizeWorktreeBranchPrefix("abc-123")).toBe("ABC-123");
    expect(buildTemporaryWorktreeBranchName("abc-123")).toMatch(/^ABC-123\/[0-9a-f]{8}$/);
    expect(isTemporaryWorktreeBranchForPrefix("ABC-123/deadbeef", "abc-123")).toBe(true);
  });

  it("derives a suffix from the namespaced worktree branch", () => {
    expect(deriveWorktreeBranchSuffix("ABC-123/fix-login-flow")).toBe("fix-login-flow");
    expect(deriveWorktreeBranchSuffix("main")).toBeNull();
  });

  it("builds semantic jira worktree branches", () => {
    expect(buildSemanticWorktreeBranchName("abc-123", "Fix login flow")).toBe(
      "ABC-123/fix-login-flow",
    );
  });

  it("identifies main and master as protected branch names", () => {
    expect(isMainOrMasterBranchName("main")).toBe(true);
    expect(isMainOrMasterBranchName("master")).toBe(true);
    expect(isMainOrMasterBranchName("refs/heads/main")).toBe(true);
    expect(isMainOrMasterBranchName("feature/main")).toBe(false);
  });

  it("validates jira keys against an optional configured project key", () => {
    expect(validateJiraKeyInput("abc-123")).toEqual({ normalized: "ABC-123", error: null });
    expect(validateJiraKeyInput("some-123", "SOME")).toEqual({
      normalized: "SOME-123",
      error: null,
    });
    expect(validateJiraKeyInput("other-123", "SOME")).toEqual({
      normalized: null,
      error: "Use a Jira key like SOME-123.",
    });
  });

  it("normalizes jira domains and project keys", () => {
    expect(normalizeJiraDomain("https://Example.atlassian.net/")).toBe("example");
    expect(normalizeJiraProjectKey(" some ")).toBe("SOME");
  });

  it("builds jira issue and create-ticket urls", () => {
    expect(buildJiraTicketUrl("example", "SOME-123")).toBe(
      "https://example.atlassian.net/browse/SOME-123",
    );
    expect(buildJiraCreateTicketUrl("example")).toBe(
      "https://example.atlassian.net/secure/CreateIssue.jspa",
    );
  });
});

describe("applyGitStatusStreamEvent", () => {
  it("treats a remote-only update as a repository when local state is missing", () => {
    const remote: GitStatusRemoteResult = {
      hasUpstream: true,
      aheadCount: 2,
      behindCount: 1,
      pr: null,
    };

    expect(applyGitStatusStreamEvent(null, { _tag: "remoteUpdated", remote })).toEqual({
      isRepo: true,
      hasOriginRemote: false,
      isDefaultBranch: false,
      branch: null,
      hasWorkingTreeChanges: false,
      workingTree: { files: [], insertions: 0, deletions: 0 },
      hasUpstream: true,
      aheadCount: 2,
      behindCount: 1,
      pr: null,
    });
  });

  it("preserves local-only fields when applying a remote update", () => {
    const current: GitStatusResult = {
      isRepo: true,
      hostingProvider: {
        kind: "github",
        name: "GitHub",
        baseUrl: "https://github.com",
      },
      hasOriginRemote: true,
      isDefaultBranch: false,
      branch: "feature/demo",
      hasWorkingTreeChanges: true,
      workingTree: {
        files: [{ path: "src/demo.ts", insertions: 1, deletions: 0 }],
        insertions: 1,
        deletions: 0,
      },
      hasUpstream: false,
      aheadCount: 0,
      behindCount: 0,
      pr: null,
    };

    const remote: GitStatusRemoteResult = {
      hasUpstream: true,
      aheadCount: 2,
      behindCount: 1,
      pr: null,
    };

    expect(applyGitStatusStreamEvent(current, { _tag: "remoteUpdated", remote })).toEqual({
      ...current,
      hasUpstream: true,
      aheadCount: 2,
      behindCount: 1,
      pr: null,
    });
  });
});
