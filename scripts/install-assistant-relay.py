#!/usr/bin/env python3
"""Install the private assistant relay as this macOS user's launch agent.

Credentials remain in the project's ignored .env. Run after configuring and testing it.
"""
import datetime
import os
import plistlib
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LABEL = "com.chaestblog.assistant"
node = shutil.which("node")
if not node or not (ROOT / ".env").is_file():
    raise SystemExit("Install Node and configure .env before installing the relay")
logs = ROOT / "logs"
logs.mkdir(exist_ok=True)
# launchd opens standard I/O before the process starts; keep those descriptors in
# Library/Logs so removable-volume access does not prevent spawning the service.
launch_logs = Path.home() / "Library/Logs/chaestblog"
launch_logs.mkdir(parents=True, exist_ok=True)
agents = Path.home() / "Library/LaunchAgents"
agents.mkdir(parents=True, exist_ok=True)
target = agents / f"{LABEL}.plist"
domain = f"gui/{os.getuid()}"
if target.exists():
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copy2(target, logs / f"assistant-agent-before-{stamp}.plist")
    subprocess.run(["launchctl", "bootout", domain, str(target)], capture_output=True)
config = {
    "Label": LABEL,
    "ProgramArguments": [node, str(ROOT / "scripts/assistant-relay.mjs")],
    "WorkingDirectory": str(ROOT),
    "RunAtLoad": True,
    "KeepAlive": True,
    "ThrottleInterval": 30,
    "EnvironmentVariables": {"PATH": f"{Path(node).parent}:/usr/bin:/bin:/usr/sbin:/sbin"},
    "StandardOutPath": str(launch_logs / "assistant-relay.log"),
    "StandardErrorPath": str(launch_logs / "assistant-relay.error.log"),
}
target.write_bytes(plistlib.dumps(config))
target.chmod(0o600)
subprocess.run(["launchctl", "bootstrap", domain, str(target)], check=True)
print(f"Installed {LABEL}: {target}")
print("Relay uses 127.0.0.1:8778. Keep the external project volume mounted.")
