/** Claude Code stores a project's sessions under its path with every non-alphanumeric character as "-" */
export function projectSlug(path: string): string {
  return path.replace(/[^a-zA-Z0-9]/g, '-')
}
