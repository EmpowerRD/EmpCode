import "../index.css";

import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

const ENVIRONMENT_ID = EnvironmentId.make("environment-local");
const THREAD_ID = ThreadId.make("thread-jira-key-test");
const PROJECT_CWD = "/repo/project";

const { setThreadJiraKeySpy, setDraftThreadContextSpy, toastAddSpy, gitStatusRef } = vi.hoisted(
  () => ({
    setThreadJiraKeySpy: vi.fn(async () => ({ sequence: 1 })),
    setDraftThreadContextSpy: vi.fn(),
    toastAddSpy: vi.fn(() => "toast-1"),
    gitStatusRef: { current: { branch: "feature/something" as string | null } },
  }),
);

vi.mock("~/environmentApi", () => ({
  readEnvironmentApi: vi.fn(() => ({
    orchestration: {
      setThreadJiraKey: setThreadJiraKeySpy,
    },
  })),
}));

vi.mock("~/lib/gitStatusState", () => ({
  useGitStatus: vi.fn(() => ({
    data: {
      branch: gitStatusRef.current.branch,
      hasWorkingTreeChanges: false,
      workingTree: { files: [], insertions: 0, deletions: 0 },
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      pr: null,
    },
    error: null,
    isPending: false,
  })),
}));

vi.mock("~/composerDraftStore", async () => {
  const draftStoreState = {
    setDraftThreadContext: setDraftThreadContextSpy,
  };
  return {
    DraftId: { makeUnsafe: (value: string) => value },
    useComposerDraftStore: Object.assign(
      (selector: (state: unknown) => unknown) => selector(draftStoreState),
      { getState: () => draftStoreState },
    ),
  };
});

vi.mock("~/components/ui/toast", () => ({
  toastManager: {
    add: toastAddSpy,
    close: vi.fn(),
    promise: vi.fn(),
    update: vi.fn(),
  },
}));

import { BranchToolbarJiraKeyControl } from "./BranchToolbarJiraKeyControl";
import type { Thread } from "../types";

function makeServerThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: THREAD_ID,
    environmentId: ENVIRONMENT_ID,
    codexThreadId: null,
    projectId: "project-1" as never,
    title: "Fix login flow",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    messages: [],
    error: null,
    createdAt: "2026-04-29T00:00:00.000Z",
    archivedAt: null,
    latestTurn: null,
    jiraKey: null,
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
    proposedPlans: [],
    ...overrides,
  };
}

async function mountControl(props: {
  serverThread?: Thread;
  effectiveEnvMode?: "local" | "worktree";
  jiraProjectKey?: string | null;
}) {
  const host = document.createElement("div");
  document.body.append(host);
  const screen = await render(
    <BranchToolbarJiraKeyControl
      environmentId={ENVIRONMENT_ID}
      threadId={THREAD_ID}
      projectCwd={PROJECT_CWD}
      effectiveEnvMode={props.effectiveEnvMode ?? "worktree"}
      jiraProjectKey={props.jiraProjectKey ?? null}
      {...(props.serverThread ? { serverThread: props.serverThread } : {})}
      draftThread={null}
    />,
    { container: host },
  );
  return {
    screen,
    cleanup: async () => {
      await screen.unmount();
      host.remove();
    },
  };
}

describe("BranchToolbarJiraKeyControl", () => {
  afterEach(() => {
    setThreadJiraKeySpy.mockClear();
    setDraftThreadContextSpy.mockClear();
    toastAddSpy.mockClear();
    gitStatusRef.current = { branch: "feature/something" };
  });

  it("auto-renames when the current branch is a temp empcode placeholder", async () => {
    const mounted = await mountControl({
      serverThread: makeServerThread({
        branch: "empcode/abcd1234",
        worktreePath: "/tmp/wt",
      }),
    });

    try {
      await mounted.screen.getByText("Add Jira Key").click();
      await mounted.screen.getByPlaceholder("ABC-123").fill("JIRA-9");
      await mounted.screen.getByRole("button", { name: "Save" }).click();

      await vi.waitFor(() => {
        expect(setThreadJiraKeySpy).toHaveBeenCalledTimes(1);
      });
      expect(setThreadJiraKeySpy).toHaveBeenCalledWith({
        threadId: THREAD_ID,
        jiraKey: "JIRA-9",
        renameBranch: true,
      });
    } finally {
      await mounted.cleanup();
    }
  });

  it("opens the rename confirm dialog when the current branch is semantic", async () => {
    const mounted = await mountControl({
      serverThread: makeServerThread({
        branch: "feature/foo",
        worktreePath: "/tmp/wt",
      }),
    });

    try {
      await mounted.screen.getByText("Add Jira Key").click();
      await mounted.screen.getByPlaceholder("ABC-123").fill("JIRA-12");
      await mounted.screen.getByRole("button", { name: "Save" }).click();

      // First call saves the Jira key without renaming.
      await vi.waitFor(() => {
        expect(setThreadJiraKeySpy).toHaveBeenCalledWith({
          threadId: THREAD_ID,
          jiraKey: "JIRA-12",
          renameBranch: false,
        });
      });

      // Confirm dialog should appear with the proposed new branch.
      const renameButton = mounted.screen.getByRole("button", { name: "Rename branch" });
      await renameButton.click();

      await vi.waitFor(() => {
        expect(setThreadJiraKeySpy).toHaveBeenCalledWith({
          threadId: THREAD_ID,
          jiraKey: "JIRA-12",
          renameBranch: true,
        });
      });
    } finally {
      await mounted.cleanup();
    }
  });

  it("clears the Jira key without renaming when the Clear button is pressed", async () => {
    const mounted = await mountControl({
      serverThread: makeServerThread({
        jiraKey: "JIRA-1",
        branch: "JIRA-1/foo",
        worktreePath: "/tmp/wt",
      }),
    });

    try {
      await mounted.screen.getByText("Jira: JIRA-1").click();
      await mounted.screen.getByRole("button", { name: "Clear" }).click();

      await vi.waitFor(() => {
        expect(setThreadJiraKeySpy).toHaveBeenCalledWith({
          threadId: THREAD_ID,
          jiraKey: null,
          renameBranch: false,
        });
      });
    } finally {
      await mounted.cleanup();
    }
  });

  it("uses the configured project key in the placeholder and validates against it", async () => {
    const mounted = await mountControl({
      serverThread: makeServerThread({
        branch: "feature/foo",
        worktreePath: "/tmp/wt",
      }),
      jiraProjectKey: "PLAT",
    });

    try {
      await mounted.screen.getByText("Add Jira Key").click();
      await mounted.screen.getByPlaceholder("PLAT-123").fill("OTHER-1");

      // Project-key constraint blocks Save with an inline error.
      const saveButton = mounted.screen.getByRole("button", { name: "Save" });
      await vi.waitFor(async () => {
        expect(await saveButton.element().getAttribute("disabled")).not.toBeNull();
      });
      const errorNode = mounted.screen.getByText(/Use a Jira key like PLAT-123/);
      expect(errorNode).toBeTruthy();
    } finally {
      await mounted.cleanup();
    }
  });
});
