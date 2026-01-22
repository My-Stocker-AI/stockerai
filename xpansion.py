#!/usr/bin/env python3
"""
Xpansion CLI Wrapper for StockerAI
Runs the production Xpansion CLI from /home/visionairy/Xpansion
"""

import sys
import os
import subprocess

# Path to actual Xpansion installation
XPANSION_DIR = "/home/visionairy/Xpansion"
XPANSION_CLI = os.path.join(XPANSION_DIR, "xpansion.py")
XPANSION_PYTHON = os.path.join(XPANSION_DIR, ".venv", "bin", "python")

# Run the CLI from Xpansion directory with all arguments
result = subprocess.run(
    [XPANSION_PYTHON, XPANSION_CLI] + sys.argv[1:],
    cwd=XPANSION_DIR
)

sys.exit(result.returncode)
