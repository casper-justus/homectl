import { HomectlConfig, HostConfig, ContextConfig } from '../config/types'

export function generateCompletion(shell: 'bash' | 'zsh' | 'fish'): string {
  switch (shell) {
    case 'bash':
      return generateBashCompletion()
    case 'zsh':
      return generateZshCompletion()
    case 'fish':
      return generateFishCompletion()
    default:
      return generateBashCompletion()
  }
}

function generateBashCompletion(): string {
  return `# homectl bash completion
_homectl_completions() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local commands="init host service logs doctor backup config cloud auth context stack completion"
  local host_sub="ls info ping exec"
  local service_sub="ls info restart start stop pull health"
  local logs_sub="tail show"
  local doctor_sub="host config all run"
  local backup_sub="run ls verify"
  local config_sub="validate show"
  local cloud_sub="ls providers info"
  local auth_sub="check"
  local context_sub="ls show use"
  local stack_sub="ls info deploy down validate"
  local global_opts="--help --version --config --context --json --plain --verbose --quiet --dry-run"

  case "\${prev}" in
    homectl) COMPREPLY=($(compgen -W "\${commands}" -- "\${cur}")) ;;
    host) COMPREPLY=($(compgen -W "\${host_sub}" -- "\${cur}")) ;;
    service) COMPREPLY=($(compgen -W "\${service_sub}" -- "\${cur}")) ;;
    logs) COMPREPLY=($(compgen -W "\${logs_sub}" -- "\${cur}")) ;;
    doctor) COMPREPLY=($(compgen -W "\${doctor_sub}" -- "\${cur}")) ;;
    backup) COMPREPLY=($(compgen -W "\${backup_sub}" -- "\${cur}")) ;;
    config) COMPREPLY=($(compgen -W "\${config_sub}" -- "\${cur}")) ;;
    cloud) COMPREPLY=($(compgen -W "\${cloud_sub}" -- "\${cur}")) ;;
    auth) COMPREPLY=($(compgen -W "\${auth_sub}" -- "\${cur}")) ;;
    context) COMPREPLY=($(compgen -W "\${context_sub}" -- "\${cur}")) ;;
    stack) COMPREPLY=($(compgen -W "\${stack_sub}" -- "\${cur}")) ;;
    --config) COMPREPLY=($(compgen -f -- "\${cur}")) ;;
    *) COMPREPLY=($(compgen -W "\${global_opts}" -- "\${cur}")) ;;
  esac
}

complete -F _homectl_completions homectl
`
}

function generateZshCompletion(): string {
  return `#compdef homectl

_homectl() {
  local -a commands
  commands=(
    'init:Generate starter configuration'
    'host:Manage and inspect hosts'
    'service:Manage and inspect services'
    'logs:View and tail container logs'
    'doctor:Run diagnostics on hosts and services'
    'backup:Back up services and data'
    'config:Manage and validate configuration'
    'cloud:Manage cloud VPS and remote infrastructure'
    'auth:Manage and verify authentication'
    'context:Manage operation contexts'
    'stack:Manage Docker Compose stacks'
    'completion:Generate shell completion'
  )

  _arguments \\
    '--help[Show help]' \\
    '--version[Show version]' \\
    '--config[Config file path]:config file:_files' \\
    '--context[Context name]:context name:' \\
    '--json[Output as JSON]' \\
    '--plain[Output as plain text]' \\
    '--verbose[Verbose output]' \\
    '--quiet[Quiet output]' \\
    '--dry-run[Show what would happen]' \\
    '*::command:->command'

  case $state in
    command)
      _describe -t commands 'homectl' commands
      ;;
  esac
}

_homectl
`
}

function generateFishCompletion(): string {
  return `# homectl fish completion
function __fish_homectl_needs_command
  set cmd (commandline -opc)
  if [ (count $cmd) -eq 1 ]
    return 0
  end
  return 1
end

function __fish_homectl_using_command
  set cmd (commandline -opc)
  if [ (count $cmd) -gt 1 ]
    if [ $argv[1] = $cmd[2] ]
      return 0
    end
  end
  return 1
end

# Commands
complete -f -c homectl -n '__fish_homectl_needs_command' -a init -d 'Generate starter configuration'
complete -f -c homectl -n '__fish_homectl_needs_command' -a host -d 'Manage and inspect hosts'
complete -f -c homectl -n '__fish_homectl_needs_command' -a service -d 'Manage and inspect services'
complete -f -c homectl -n '__fish_homectl_needs_command' -a logs -d 'View and tail container logs'
complete -f -c homectl -n '__fish_homectl_needs_command' -a doctor -d 'Run diagnostics'
complete -f -c homectl -n '__fish_homectl_needs_command' -a backup -d 'Back up services and data'
complete -f -c homectl -n '__fish_homectl_needs_command' -a config -d 'Manage configuration'
complete -f -c homectl -n '__fish_homectl_needs_command' -a cloud -d 'Manage cloud VPS'
complete -f -c homectl -n '__fish_homectl_needs_command' -a auth -d 'Manage authentication'
complete -f -c homectl -n '__fish_homectl_needs_command' -a context -d 'Manage contexts'
complete -f -c homectl -n '__fish_homectl_needs_command' -a stack -d 'Manage Compose stacks'
complete -f -c homectl -n '__fish_homectl_needs_command' -a completion -d 'Shell completion'

# Global options
complete -c homectl -l help -d 'Show help'
complete -c homectl -l version -d 'Show version'
complete -c homectl -l json -d 'Output as JSON'
complete -c homectl -l plain -d 'Output as plain text'
complete -c homectl -l verbose -d 'Verbose output'
complete -c homectl -l quiet -d 'Quiet output'
complete -c homectl -l dry-run -d 'Show what would happen'
`
}
