# homectl

**Operate your homelab and small cloud fleet from one terminal.**

homectl is a unified CLI for managing Docker/Compose workloads across multiple hosts — local machines, Raspberry Pis, VPS instances, and cloud VMs — all through a single YAML config and SSH-first architecture.

## Install

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/casper-justus/homectl/main/install.sh | bash
```

```powershell
# Windows (PowerShell)
iwr -useb https://raw.githubusercontent.com/casper-justus/homectl/main/install.ps1 | iex
```

The script auto-detects your OS, installs Node.js if missing, downloads the latest homectl, builds it, and links it globally.

Alternatively via npm:

```bash
npm install -g homectl
```

## Quick start

```bash
homectl init                           # interactive setup
homectl host ls                        # list all hosts
homectl context use prod               # switch context
homectl service ls                     # list all services
homectl stack deploy myapp             # deploy a compose stack
```

## Features

- **Unified host management** — one config to rule all your machines
- **SSH-first remote execution** — never expose your Docker daemon over TCP
- **Docker & Compose aware** — works with plain containers and full Compose stacks
- **Operation contexts** — switch between `lab`, `prod`, `staging` environments
- **Interactive init wizard** — TUI-based setup with keyboard navigation
- **Diagnostics engine** — deep health checks with actionable next steps
- **Cross-platform** — Windows, Linux, macOS
- **Machine-readable output** — `--json`, `--plain`, `--verbose`, `--quiet`
- **Safety-first** — `--dry-run`, confirmation prompts, input validation
- **Shell completion** — bash, zsh, fish

## Configuration

homectl uses a single YAML config file (default: `~/.config/homectl/config.yaml`):

```yaml
version: 1
defaultContext: lab

contexts:
  - name: lab
    host: media-node

hosts:
  - name: local
    connection:
      type: local
      host: localhost
    runtime:
      docker: true
      compose: true
    tags: [local, dev]

  - name: vps-1
    connection:
      type: ssh
      host: 203.0.113.10
      user: deploy
      port: 2222
      identityFile: ~/.ssh/vps_deploy
    runtime:
      docker: true
      compose: false
    tags: [cloud, prod]
```

## Command reference

| Command | Description |
|---------|-------------|
| `init` | Interactive setup wizard |
| `host ls` | List all hosts |
| `host info <name>` | Show host details |
| `host ping <name>` | Check host connectivity |
| `host exec <name> <cmd>` | Run command on host |
| `service ls` | List all services |
| `service info <name>` | Show service details |
| `service restart <name>` | Restart a service |
| `service start <name>` | Start a service |
| `service stop <name>` | Stop a service |
| `service pull <name>` | Pull latest image |
| `service health <name>` | Check service health |
| `logs tail <service>` | Tail service logs |
| `logs show <service>` | Show service logs |
| `context ls` | List contexts |
| `context show [name]` | Show context details |
| `context use <name>` | Switch context |
| `stack ls` | List Compose stacks |
| `stack info <name>` | Show stack details |
| `stack deploy <name>` | Deploy a stack |
| `stack down <name>` | Bring down a stack |
| `stack validate <name>` | Validate compose config |
| `doctor host [name]` | Check host health |
| `doctor config` | Validate configuration |
| `doctor all` | Full diagnostics |
| `doctor run [host]` | Full diagnostics suite |
| `backup run <schedule>` | Run a backup |
| `backup ls` | List backups |
| `backup verify <schedule>` | Verify latest backup |
| `config validate` | Validate config file |
| `config show` | Show current config |
| `cloud ls` | List cloud instances |
| `cloud providers` | List cloud providers |
| `auth check` | Check SSH authentication |
| `completion [shell]` | Generate shell completions |

## License

MIT
