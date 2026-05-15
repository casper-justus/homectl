import * as fs from 'fs'
import * as path from 'path'
import { HostConfig } from '../config/types'
import { SSHClient } from '../adapters/ssh'

export interface SSHAuthCheck {
  host: string
  method: 'key' | 'password' | 'agent' | 'none'
  keyPath?: string
  valid: boolean
  message: string
  tls?: string
}

export interface AuthPolicy {
  rejectPasswordAuth: boolean
  requireHostKey: boolean
  minKeySize: number
  allowedKeyTypes: string[]
}

const DEFAULT_POLICY: AuthPolicy = {
  rejectPasswordAuth: true,
  requireHostKey: true,
  minKeySize: 2048,
  allowedKeyTypes: ['ed25519', 'ecdsa', 'rsa'],
}

export async function checkSSHAuth(
  hostConfig: HostConfig,
): Promise<SSHAuthCheck> {
  if (hostConfig.connection.identityFile) {
    const resolvedPath = expandPath(hostConfig.connection.identityFile)
    if (!fs.existsSync(resolvedPath)) {
      return {
        host: hostConfig.connection.host,
        method: 'key',
        keyPath: hostConfig.connection.identityFile,
        valid: false,
        message: `SSH key not found: ${hostConfig.connection.identityFile}`,
      }
    }

    const keyInfo = await validateKeyFile(resolvedPath)
    if (!keyInfo.valid) {
      return {
        host: hostConfig.connection.host,
        method: 'key',
        keyPath: hostConfig.connection.identityFile,
        valid: false,
        message: keyInfo.message,
      }
    }

    try {
      const ssh = new SSHClient()
      await ssh.connect(hostConfig)
      ssh.disconnect()
      return {
        host: hostConfig.connection.host,
        method: 'key',
        keyPath: hostConfig.connection.identityFile,
        valid: true,
        message: `SSH key auth succeeded (${keyInfo.type || 'unknown'} ${keyInfo.bits || '?'} bits)`,
      }
    } catch (err) {
      return {
        host: hostConfig.connection.host,
        method: 'key',
        keyPath: hostConfig.connection.identityFile,
        valid: false,
        message: `SSH key auth failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  if (hostConfig.connection.user) {
    return {
      host: hostConfig.connection.host,
      method: 'agent',
      valid: false,
      message: `No SSH key configured for ${hostConfig.connection.user}@${hostConfig.connection.host}. Set identityFile in config.`,
    }
  }

  return {
    host: hostConfig.connection.host,
    method: 'none',
    valid: false,
    message: 'No authentication method configured',
  }
}

interface KeyInfo {
  valid: boolean
  type?: string
  bits?: number
  message: string
}

async function validateKeyFile(keyPath: string): Promise<KeyInfo> {
  try {
    const content = fs.readFileSync(keyPath, 'utf-8').trim()
    const header = content.split('\n')[0]

    if (header.includes('ENCRYPTED') || content.includes('DEK-Info')) {
      return { valid: true, message: 'Encrypted key (passphrase required)' }
    }

    if (header.includes('OPENSSH PRIVATE KEY')) {
      return { valid: true, type: 'ed25519/rsa', message: 'OpenSSH format' }
    }
    if (header.includes('PRIVATE KEY')) {
      return { valid: true, type: 'rsa/ecdsa', message: 'PEM format' }
    }

    return { valid: true, type: 'unknown', message: 'Key file exists' }
  } catch (err) {
    return { valid: false, message: `Cannot read key file: ${err instanceof Error ? err.message : String(err)}` }
  }
}

function expandPath(filePath: string): string {
  if (filePath.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE || '~'
    return filePath.replace('~', home)
  }
  return path.resolve(filePath)
}

export function validateDockerTLSAuth(
  hostConfig: HostConfig,
): { valid: boolean; message: string } {
  if (hostConfig.connection.type === 'ssh') {
    return { valid: true, message: 'SSH transport is secure for remote Docker' }
  }
  if (hostConfig.connection.type === 'docker-socket') {
    return {
      valid: hostConfig.connection.host === 'localhost',
      message: hostConfig.connection.host !== 'localhost'
        ? 'WARNING: Exposing Docker socket over TCP without TLS is dangerous'
        : 'Local socket OK',
    }
  }
  return { valid: true, message: 'Connection method unknown' }
}

export function getAuthPolicy(): AuthPolicy {
  return DEFAULT_POLICY
}
