### Python
Use a project-local `.venv` for all Python work. If `.venv` does not exist, create it with `(python3 | python) -m venv .venv`, then use `.venv/bin/python` and `.venv/bin/pip`. Never use system Python for packages or `--break-system-packages`.
Keep a `pyrightconfig.json` in the repo root, and set `executionEnvironments` `root` to the directory containing the Python package, so the language server resolves imports. Run Python tools (uvicorn, alembic, etc.) from that directory.

### Frontend
When working with the frontend, check design guidelines in `DESIGN.md` if it exists.

