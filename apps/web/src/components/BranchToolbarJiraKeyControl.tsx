import { scopeThreadRef } from "@t3tools/client-runtime";
import { DEFAULT_THREAD_TITLE, type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import {
  buildRenamedJiraBranchName,
  isMainOrMasterBranchName,
  isTemporaryWorktreeBranchForAnyPrefix,
  normalizeWorktreeBranchPrefix,
  validateJiraKeyInput,
} from "@t3tools/shared/git";
import { useEffect, useMemo, useState } from "react";

import { useComposerDraftStore, type DraftId, type DraftThreadState } from "../composerDraftStore";
import { readEnvironmentApi } from "../environmentApi";
import { useGitStatus } from "../lib/gitStatusState";
import type { Thread } from "../types";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { toastManager } from "./ui/toast";

export function BranchToolbarJiraKeyControl(props: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  projectCwd: string;
  effectiveEnvMode: "local" | "worktree";
  jiraProjectKey: string | null;
  draftId?: DraftId;
  serverThread?: Thread;
  draftThread: DraftThreadState | null;
  onComposerFocusRequest?: () => void;
}) {
  const {
    environmentId,
    threadId,
    projectCwd,
    effectiveEnvMode,
    jiraProjectKey,
    draftId,
    serverThread,
    draftThread,
  } = props;
  const threadRef = useMemo(
    () => scopeThreadRef(environmentId, threadId),
    [environmentId, threadId],
  );
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const activeThread = serverThread ?? draftThread;
  const currentJiraKey = activeThread?.jiraKey ?? null;
  const currentBranch = activeThread?.branch ?? null;
  const currentTitle = serverThread?.title ?? DEFAULT_THREAD_TITLE;
  const gitStatus = useGitStatus({
    environmentId,
    cwd: effectiveEnvMode === "worktree" ? null : projectCwd,
  });
  const resolvedLocalBranch = gitStatus.data?.branch ?? currentBranch;
  const jiraKeyAllowed =
    effectiveEnvMode === "worktree" ||
    (resolvedLocalBranch !== null && !isMainOrMasterBranchName(resolvedLocalBranch));
  const guardrailMessage =
    jiraKeyAllowed || currentJiraKey !== null ? null : (
      <>
        Jira keys can only be set in a worktree or when the current checkout is not{" "}
        <code>main</code> or <code>master</code>.
      </>
    );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(currentJiraKey ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingRename, setPendingRename] = useState<{
    jiraKey: string;
    targetBranch: string;
  } | null>(null);

  useEffect(() => {
    if (!dialogOpen) {
      setDraftValue(currentJiraKey ?? "");
    }
  }, [currentJiraKey, dialogOpen]);

  const validation = validateJiraKeyInput(draftValue, jiraProjectKey);
  const normalizedJiraKey = validation.normalized;
  const isBlockedByGuardrail = normalizedJiraKey !== null && !jiraKeyAllowed;
  const canSave =
    !isSaving &&
    validation.error === null &&
    !isBlockedByGuardrail &&
    normalizedJiraKey !== currentJiraKey;

  const persistDraftJiraKey = (jiraKey: string | null) => {
    const target = draftId ?? threadRef;
    setDraftThreadContext(target, { jiraKey });
    setDialogOpen(false);
    props.onComposerFocusRequest?.();
  };

  const persistServerJiraKey = async (jiraKey: string | null, renameBranch: boolean) => {
    const api = readEnvironmentApi(environmentId);
    if (!api) {
      throw new Error(`Environment API not found for ${environmentId}.`);
    }
    await api.orchestration.setThreadJiraKey({ threadId, jiraKey, renameBranch });
  };

  const handleSave = async () => {
    if (!activeThread || !canSave) return;

    if (!serverThread) {
      persistDraftJiraKey(normalizedJiraKey);
      return;
    }

    setIsSaving(true);
    try {
      if (normalizedJiraKey === null) {
        await persistServerJiraKey(null, false);
        setDialogOpen(false);
        props.onComposerFocusRequest?.();
        return;
      }

      if (!currentBranch) {
        await persistServerJiraKey(normalizedJiraKey, false);
        setDialogOpen(false);
        props.onComposerFocusRequest?.();
        return;
      }

      const currentPrefix = currentBranch.split("/")[0] ?? "";
      if (normalizeWorktreeBranchPrefix(currentPrefix) === normalizedJiraKey) {
        await persistServerJiraKey(normalizedJiraKey, false);
        setDialogOpen(false);
        props.onComposerFocusRequest?.();
        return;
      }

      const renameTarget = buildRenamedJiraBranchName({
        currentBranch,
        newJiraKey: normalizedJiraKey,
        fallbackTitle: currentTitle,
      });

      // If the current branch is still a server-generated placeholder, the
      // random hex suffix is meaningless — auto-rename to the title-derived
      // form without bothering the user with a confirm step.
      if (isTemporaryWorktreeBranchForAnyPrefix(currentBranch)) {
        await persistServerJiraKey(normalizedJiraKey, true);
        setDialogOpen(false);
        props.onComposerFocusRequest?.();
        return;
      }

      // Save the Jira key now (no rename), then ask the user whether to rename.
      await persistServerJiraKey(normalizedJiraKey, false);
      setPendingRename({ jiraKey: normalizedJiraKey, targetBranch: renameTarget });
      setDialogOpen(false);
      setConfirmOpen(renameTarget !== currentBranch);
      props.onComposerFocusRequest?.();
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to save Jira key",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const confirmRename = async () => {
    if (!pendingRename) return;
    setIsSaving(true);
    try {
      await persistServerJiraKey(pendingRename.jiraKey, true);
      setConfirmOpen(false);
      setPendingRename(null);
      props.onComposerFocusRequest?.();
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to rename branch",
        description:
          error instanceof Error
            ? `${error.message} The Jira key was still saved.`
            : "The Jira key was saved, but the branch rename failed.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button
        size="xs"
        variant="ghost"
        className="font-medium text-muted-foreground/70"
        onClick={() => setDialogOpen(true)}
      >
        {currentJiraKey ? `Jira: ${currentJiraKey}` : "Add Jira Key"}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{currentJiraKey ? "Edit Jira key" : "Add Jira key"}</DialogTitle>
            <DialogDescription>
              Save an optional Jira key to this thread and use it for worktree branch naming.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-2">
              <Input
                autoFocus
                placeholder={`${jiraProjectKey ?? "ABC"}-123`}
                value={draftValue}
                onChange={(event) => setDraftValue(event.currentTarget.value)}
              />
              {validation.error ? (
                <p className="text-destructive text-xs">{validation.error}</p>
              ) : null}
              {isBlockedByGuardrail ? (
                <p className="text-destructive text-xs">
                  Jira keys can only be set in a worktree or when the current checkout is not{" "}
                  <code>main</code> or <code>master</code>.
                </p>
              ) : null}
              {guardrailMessage ? (
                <p className="text-muted-foreground text-xs">{guardrailMessage}</p>
              ) : null}
              <p className="text-muted-foreground text-xs">
                Branches use <code>{normalizedJiraKey ?? "KEY"}/slug</code> when a Jira key is set.
              </p>
            </div>
          </DialogPanel>
          <DialogFooter variant="bare">
            {currentJiraKey ? (
              <Button
                variant="outline"
                disabled={isSaving}
                onClick={async () => {
                  setIsSaving(true);
                  try {
                    if (serverThread) {
                      await persistServerJiraKey(null, false);
                    } else {
                      persistDraftJiraKey(null);
                    }
                    setDialogOpen(false);
                    props.onComposerFocusRequest?.();
                  } catch (error) {
                    toastManager.add({
                      type: "error",
                      title: "Failed to clear Jira key",
                      description:
                        error instanceof Error ? error.message : "An unexpected error occurred.",
                    });
                  } finally {
                    setIsSaving(false);
                  }
                }}
              >
                Clear
              </Button>
            ) : null}
            <Button variant="outline" disabled={isSaving} onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!canSave} onClick={() => void handleSave()}>
              Save
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Rename branch to match Jira key?</DialogTitle>
            <DialogDescription>
              The Jira key has been saved. Rename the current branch to match it now?
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-2 text-sm">
              <p>Current branch: {currentBranch ?? "(none)"}</p>
              <p>New branch: {pendingRename?.targetBranch ?? "(none)"}</p>
            </div>
          </DialogPanel>
          <DialogFooter variant="bare">
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => {
                setConfirmOpen(false);
                setPendingRename(null);
                props.onComposerFocusRequest?.();
              }}
            >
              Keep current branch
            </Button>
            <Button disabled={isSaving} onClick={() => void confirmRename()}>
              Rename branch
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
