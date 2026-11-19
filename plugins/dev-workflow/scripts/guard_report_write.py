"""Restrict specialist Write calls to new role-owned development reports."""

import json
import re
import sys
from pathlib import Path


ROLES = {
    "architect", "manual-tester", "code-reviewer", "security-reviewer",
    "database-reviewer", "researcher",
}
PLUGIN_PREFIX = "dev-workflow:"


def validate(payload, role):
    if role not in ROLES or payload.get("tool_name") != "Write":
        raise ValueError("Only a configured specialist's Write call is permitted.")
    raw_path = payload["tool_input"]["file_path"]
    target = Path(raw_path)
    cwd = Path(payload["cwd"])
    if not target.is_absolute() or not cwd.is_absolute():
        raise ValueError("Report path and runtime cwd must be absolute.")
    if ".." in target.parts or any(":" in part for part in target.parts[1:]):
        raise ValueError("Traversal and alternate data streams are not permitted.")
    if target.exists() or target.is_symlink():
        raise ValueError("Reports are write-once; request a new report filename.")
    cwd = cwd.resolve(strict=True)
    for root in (cwd, *cwd.parents):
        run_root = root / ".claude" / "personal" / "runs"
        try:
            relative = target.relative_to(run_root)
        except ValueError:
            continue
        parts = relative.parts
        if len(parts) != 4 or parts[1:3] != ("reports", role):
            continue
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*\.md", parts[3]):
            raise ValueError("Use a plain dispatch-id.md report filename.")
        run = run_root / parts[0]
        if not (run / "state.md").is_file():
            raise ValueError("The orchestrator must initialize this run first.")
        # reject directory redirection, including Windows junctions
        for directory in (run_root.parent.parent, run_root.parent, run_root,
                          run, run / "reports", target.parent):
            if directory.resolve() != directory:
                raise ValueError("Report directories must not redirect through links.")
        if target.resolve().parent != target.parent:
            raise ValueError("Report path resolves outside its assigned directory.")
        return
    raise ValueError("Write is limited to this project's runs/<task>/reports/<role> directory.")


def guarded_role(payload):
    # plugin agents report a namespaced type such as "dev-workflow:architect"
    agent_type = payload.get("agent_type") if isinstance(payload, dict) else None
    if not isinstance(agent_type, str):
        return None
    role = agent_type.removeprefix(PLUGIN_PREFIX)
    return role if role in ROLES else None


def main():
    try:
        payload = json.load(sys.stdin)
    except (ValueError, UnicodeError, OSError):
        return 0
    role = guarded_role(payload)
    # this hook fires for every Write/Edit; only the report-only specialists are restricted
    if role is None:
        return 0
    try:
        validate(payload, role)
    except (ValueError, KeyError, TypeError, AttributeError, IndexError, OSError, RuntimeError) as error:
        print(f"Report write denied: {error}", file=sys.stderr)
        return 2
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "allow",
        "permissionDecisionReason": "New role-owned report in an initialized development run.",
    }}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
