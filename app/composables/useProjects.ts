export interface UserProject {
  id: string
  name: string
  path: string
  createdAt: string
}

const trim = (p: string) => p.replace(/\/+$/, '')

/** Projects the user created (name + directory). Shared state, so the sidebar and dialogs stay in sync. */
export function useProjects() {
  const projects = useState<UserProject[]>('registered-projects', () => [])
  const loaded = useState('registered-projects-loaded', () => false)

  async function fetchProjects() {
    try {
      projects.value = (await $fetch<{ projects: UserProject[] }>('/api/registered-projects')).projects
    } finally {
      loaded.value = true
    }
  }

  async function createProject(input: { name: string; path: string }) {
    const created = await $fetch<UserProject>('/api/registered-projects', { method: 'POST', body: input })
    projects.value = [...projects.value, created]
    return created
  }

  async function updateProject(id: string, input: { name?: string; path?: string }) {
    const updated = await $fetch<UserProject>(`/api/registered-projects/${id}`, { method: 'PUT', body: input })
    projects.value = projects.value.map(p => (p.id === id ? updated : p))
    return updated
  }

  async function removeProject(id: string) {
    await $fetch(`/api/registered-projects/${id}`, { method: 'DELETE' })
    projects.value = projects.value.filter(p => p.id !== id)
  }

  /** The project whose directory is `dir`, if the user created one. */
  function projectForDir(dir: string) {
    const d = trim(dir)
    return d ? projects.value.find(p => trim(p.path) === d) : undefined
  }

  return { projects, loaded, fetchProjects, createProject, updateProject, removeProject, projectForDir }
}
