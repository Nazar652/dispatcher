"""Return a small role reminder only for a registered /develop session."""

import json
import os
from pathlib import Path
import re
import sys


def project_roots(cwd, initial_project=None):
    roots = []
    for raw in (cwd, initial_project):
        if not isinstance(raw, str) or not raw or not Path(raw).is_absolute():
            continue
        directory = Path(raw).resolve()
        for candidate in (directory, *directory.parents):
            if (candidate / ".git").exists() or (candidate / ".claude/personal/runs").is_dir():
                if candidate not in roots:
                    roots.append(candidate)
                break
    return roots


def reminder(payload, initial_project=None):
    if not isinstance(payload, dict):
        return None
    if payload.get("hook_event_name") != "SessionStart" or payload.get("source") not in {"compact", "resume"}:
        return None
    if payload.get("agent_id") or payload.get("agent_type"):
        return None
    session_id = payload.get("session_id")
    if not isinstance(session_id, str) or not session_id:
        return None

    matching = []
    for root in project_roots(payload.get("cwd"), initial_project):
        for marker in (root / ".claude/personal/runs").glob("*/orchestrator-session.json"):
            try:
                if marker.stat().st_size > 4096:
                    continue
                record = json.loads(marker.read_text(encoding="utf-8-sig"))
                if not isinstance(record, dict):
                    continue
                if (record.get("version") != 1 or record.get("workflow") != "develop"
                        or record.get("session_id") != session_id or record.get("active") is not True):
                    continue
                state = marker.parent / "state.md"
                # a stale activation must not revive a completed/cancelled run
                if state.is_file():
                    with state.open(encoding="utf-8-sig") as source:
                        header = source.read(8192)
                    if re.search(r"(?im)^\s*(?:[-*]\s+)?(?:\*\*)?(?:status|final status)(?:\*\*)?\s*:\s*(?:\*\*|`)?(?:DONE|CANCELLED)\b", header):
                        continue
                if state not in matching:
                    matching.append(state)
            except (OSError, UnicodeError, ValueError):
                continue

    if not matching:
        return None
    paths = "\n".join(f"- {path}" for path in matching)
    ambiguity = "Multiple registered runs match. Resolve the active run before delegation; do not guess. " if len(matching) > 1 else ""
    return (
        "DEVELOP ORCHESTRATOR ROLE RESTORE\n"
        "This exact main session invoked /develop and has an active session registration. "
        "You are its GUIDED workflow orchestrator, not the developer. "
        "Do not implement or edit project source, run project commands, manually test, or review code yourself. "
        "Delegate specialist work to the recorded eligible agents; reuse them under the existing continuity rules.\n"
        "Before continuing, read the current state at the path below and only the relevant contract/policy sections. "
        "Restore phase, approval state, agent IDs, open findings, pending questions and next action. "
        "Read the Main-session orchestrator section of the develop skill if role instructions are missing. "
        "Do not reload the whole history or restart discovery. Compaction does not grant approval or invalidate valid checks. "
        + ambiguity
        + "If state is missing or inconsistent, recover the specific missing facts before advancing; never take over implementation. "
        "Respect any subsequent explicit user cancellation or workflow change; deactivate this run's orchestrator-session.json registration when leaving /develop.\n"
        "Registered state path(s):\n" + paths
    )


def main():
    try:
        context = reminder(json.load(sys.stdin), os.environ.get("CLAUDE_PROJECT_DIR"))
    except (OSError, UnicodeError, ValueError, TypeError):
        return 0
    if context:
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "SessionStart", "additionalContext": context,
        }}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
