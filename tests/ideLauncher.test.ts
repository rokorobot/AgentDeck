import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  buildIdeOpenCommand,
  resolveExecutableOnPath,
  findEditorExecutable,
} from '../src/lib/ideLauncher';

describe('buildIdeOpenCommand — mapping', () => {
  it('maps vscode to the code command with the real Windows exe', () => {
    expect(buildIdeOpenCommand('vscode', 'C:/proj')).toEqual({
      command: 'code',
      args: ['C:/proj'],
      windowsExeName: 'Code.exe',
    });
  });

  it('maps cursor to the cursor command', () => {
    expect(buildIdeOpenCommand('cursor', 'C:/proj')).toEqual({
      command: 'cursor',
      args: ['C:/proj'],
      windowsExeName: 'Cursor.exe',
    });
  });

  it('returns null for folder and unknown ids (handled without spawning)', () => {
    expect(buildIdeOpenCommand('folder', 'C:/proj')).toBeNull();
    expect(buildIdeOpenCommand('rm-rf', 'C:/proj')).toBeNull();
    expect(buildIdeOpenCommand('', 'C:/proj')).toBeNull();
  });
});

describe('buildIdeOpenCommand — injection safety', () => {
  // The whole point of the fix: a hostile folderPath must remain ONE literal argv
  // element and must never be concatenated into a shell string.
  const payloads = [
    'C:/proj" & calc & "',
    'C:/proj; rm -rf ~',
    'C:/proj | calc',
    'C:/proj$(calc)',
    'C:/proj`calc`',
    'C:/proj && shutdown /s',
  ];

  it.each(payloads)('keeps %s as a single literal argument', (payload) => {
    const spec = buildIdeOpenCommand('vscode', payload)!;
    // command is a fixed literal — never carries the path or any metacharacters.
    expect(spec.command).toBe('code');
    // args is exactly the path, untouched: no splitting, escaping, or quoting.
    expect(spec.args).toHaveLength(1);
    expect(spec.args[0]).toBe(payload);
    // No field anywhere is a shell string that fused the command with the path.
    expect(spec.command).not.toContain(payload);
    expect(spec.command).not.toMatch(/["&|;$`]/);
  });
});

describe('resolveExecutableOnPath', () => {
  const opts = (fileExists: (c: string) => boolean) => ({
    pathValue: ['C:\\a', 'C:\\b'].join(';'),
    pathext: '.EXE;.CMD',
    fileExists,
    delimiter: ';',
  });

  it('finds the command in a later PATH dir with a PATHEXT extension', () => {
    const expected = path.join('C:\\b', 'code.CMD');
    const result = resolveExecutableOnPath('code', opts((c) => c === expected));
    expect(result).toBe(expected);
  });

  it('prefers an earlier extension/dir match', () => {
    const first = path.join('C:\\a', 'code.EXE');
    const result = resolveExecutableOnPath('code', opts((c) => c === first || c === path.join('C:\\b', 'code.CMD')));
    expect(result).toBe(first);
  });

  it('returns null when nothing matches', () => {
    expect(resolveExecutableOnPath('code', opts(() => false))).toBeNull();
  });
});

describe('findEditorExecutable', () => {
  it('finds Code.exe one level above the bin shim (VS Code layout)', () => {
    const shim = path.join('C:\\Programs\\Microsoft VS Code', 'bin', 'code.cmd');
    const exe = path.join('C:\\Programs\\Microsoft VS Code', 'Code.exe');
    expect(findEditorExecutable(shim, 'Code.exe', (c) => c === exe)).toBe(exe);
  });

  it('finds Cursor.exe three levels above the shim (Cursor layout)', () => {
    const shim = path.join('C:\\Programs\\cursor', 'resources', 'app', 'bin', 'cursor.cmd');
    const exe = path.join('C:\\Programs\\cursor', 'Cursor.exe');
    expect(findEditorExecutable(shim, 'Cursor.exe', (c) => c === exe)).toBe(exe);
  });

  it('returns null when the exe is not found within maxDepth', () => {
    const shim = path.join('C:\\a', 'b', 'c', 'd', 'e', 'f', 'g', 'code.cmd');
    const exe = path.join('C:\\a', 'Code.exe');
    expect(findEditorExecutable(shim, 'Code.exe', (c) => c === exe, 2)).toBeNull();
  });
});
