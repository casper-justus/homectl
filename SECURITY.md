# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.x     | ✅ |

## Reporting a vulnerability

homectl connects to remote hosts via SSH and executes Docker commands. If you find a security issue:

1. **Do not** open a public GitHub issue
2. Email: njahjustus@gmail.com
3. Include a description, impact, and reproduction steps

You'll receive a response within 48 hours.

## Best practices

- **Always use SSH keys** — never use password-based SSH auth
- **Never expose Docker daemon over TCP** — homectl uses SSH for all remote Docker operations
- **Use identity files** — specify `identityFile` in your host config for key-based auth
- **Review config permissions** — `~/.config/homectl/config.yaml` can contain host IPs and SSH key paths
